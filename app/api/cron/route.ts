import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {notifyPaymentDue, sendEOIReminder} from '@/lib/email';
import {logAudit} from '@/lib/audit';

// This endpoint is called by Vercel Cron or manually
// It processes: EOI expiry, payment due reminders, penalty calculations

// EOI expires 7 days after eoi_date
const EOI_EXPIRY_DAYS = 7;

// Reminder thresholds in hours before expiry
const REMINDER_THRESHOLDS = [
  {key: '72h', hours: 72},
  {key: '48h', hours: 48},
  {key: '24h', hours: 24},
  {key: 'expiry', hours: 0},
] as const;

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({error: 'Cron secret not configured'}, {status: 500});
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const results = {
    eoiExpired: 0,
    eoiRemindersSent: 0,
    paymentReminders: 0,
    penaltiesCalculated: 0,
    errors: [] as string[],
  };

  try {
    // Ensure reminder tracking table exists
    await sql`
      CREATE TABLE IF NOT EXISTS payment_reminders (
        id SERIAL PRIMARY KEY,
        transaction_id UUID NOT NULL,
        milestone_label TEXT NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // 1. EOI Reminders and Auto-Release
    // Find all EOI transactions with their expiry calculation
    const eoiTransactions = await sql`
      SELECT 
        t.id, 
        t.unit_id, 
        t.buyer_id, 
        t.eoi_date, 
        t.eoi_amount,
        t.total_price,
        t.agent_id,
        t.reminders_sent,
        t.tenant_id,
        u.unit_number,
        p.name as project_name,
        b.email as buyer_email,
        b.full_name as buyer_name,
        b.phone as buyer_phone,
        agent.email as agent_email
      FROM transactions t
      JOIN units u ON t.unit_id = u.id
      JOIN projects p ON u.project_id = p.id
      JOIN buyers b ON t.buyer_id = b.id
      LEFT JOIN users agent ON t.agent_id = agent.id
      WHERE t.status = 'eoi'
    `;

    const now = new Date();

    for (const tx of eoiTransactions) {
      try {
        // Calculate expiry date (eoi_date + 7 days)
        const eoiDate = new Date(tx.eoi_date);
        const expiryDate = new Date(eoiDate);
        expiryDate.setDate(expiryDate.getDate() + EOI_EXPIRY_DAYS);

        const hoursUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60));

        // Check if expired
        if (hoursUntilExpiry <= 0) {
          // Cancel transaction
          await sql`UPDATE transactions SET status = 'cancelled', updated_at = NOW() WHERE id = ${tx.id}`;
          // Release unit back to available
          await sql`UPDATE units SET status = 'available', updated_at = NOW() WHERE id = ${tx.unit_id}`;
          
          // Log to audit
          await logAudit({
            tenantId: tx.tenant_id,
            userId: 'system',
            action: 'status_change',
            resourceType: 'transaction',
            resourceId: tx.id,
            before: {status: 'eoi'},
            after: {status: 'cancelled', reason: 'eoi_expired'},
          });

          results.eoiExpired++;
          continue;
        }

        // Check reminder thresholds
        const remindersSent = (tx.reminders_sent as Record<string, string>) || {};
        const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000'}/portal/${tx.portal_token}`;

        for (const {key, hours} of REMINDER_THRESHOLDS) {
          // Skip if reminder already sent
          if (remindersSent[key]) continue;

          // Check if we're within the window to send this reminder
          // Send when hoursUntilExpiry <= threshold AND hoursUntilExpiry > (next lower threshold or 0)
          const nextLowerHours = REMINDER_THRESHOLDS.find(t => t.hours < hours)?.hours ?? -1;
          
          if (hoursUntilExpiry <= hours && hoursUntilExpiry > nextLowerHours) {
            // Send reminder email
            if (tx.buyer_email) {
              await sendEOIReminder({
                to: tx.buyer_email,
                cc: tx.agent_email || undefined,
                buyerName: tx.buyer_name,
                unitNumber: tx.unit_number,
                projectName: tx.project_name,
                eoiAmount: Number(tx.eoi_amount || 0),
                hoursRemaining: Math.max(0, hoursUntilExpiry),
                deadline: expiryDate.toLocaleDateString('en-AE', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                portalUrl,
              });

              // Update reminders_sent JSONB
              const updatedReminders = {
                ...remindersSent,
                [key]: new Date().toISOString(),
              };
              
              await sql`
                UPDATE transactions 
                SET reminders_sent = ${JSON.stringify(updatedReminders)},
                    updated_at = NOW()
                WHERE id = ${tx.id}
              `;

              results.eoiRemindersSent++;
            }
            break; // Only send one reminder per transaction per cron run
          }
        }
      } catch (err: any) {
        results.errors.push(`EOI reminder failed for ${tx.id}: ${err.message}`);
      }
    }

    // 2. Payment Due Reminders: Find upcoming payments within next 7 days
    const upcomingPayments = await sql`
      WITH confirmed_payments AS (
        SELECT transaction_id, COALESCE(SUM(amount), 0) as paid
        FROM payments
        WHERE status = 'confirmed'
        GROUP BY transaction_id
      ),
      milestones AS (
        SELECT
          t.id as transaction_id,
          t.buyer_id,
          t.total_price,
          t.booking_date,
          b.email,
          u.unit_number,
          (pp.milestones) as milestones,
          pp.penalty_rate
        FROM transactions t
        JOIN buyers b ON t.buyer_id = b.id
        JOIN units u ON t.unit_id = u.id
        JOIN payment_plans pp ON t.payment_plan_id = pp.id
        WHERE t.status IN ('confirmed', 'booking_pending')
      )
      SELECT * FROM milestones m
      LEFT JOIN confirmed_payments cp ON m.transaction_id = cp.transaction_id
      WHERE cp.paid IS NULL OR cp.paid < m.total_price
    `;

    for (const tx of upcomingPayments) {
      try {
        const milestones = tx.milestones as any[];
        const paid = Number(tx.paid || 0);
        const totalPrice = Number(tx.total_price);
        const bookingDate = new Date(tx.booking_date);

        for (const milestone of milestones) {
          const milestoneAmount = (totalPrice * milestone.percent) / 100;
          const dueDate = new Date(bookingDate);
          dueDate.setDate(dueDate.getDate() + milestone.due_days_from_booking);

          const totalPaid = paid;

          // If not fully paid and due date is within 7 days
          if (totalPaid < totalPrice && dueDate > new Date() && dueDate < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) {
            // Check if reminder was already sent in the last 24 hours
            const recentReminder = await sql`
              SELECT 1 FROM payment_reminders
              WHERE transaction_id = ${tx.transaction_id}
              AND milestone_label = ${milestone.label}
              AND sent_at > NOW() - INTERVAL '24 hours'
              LIMIT 1
            `;
            if (recentReminder.length > 0) continue;

            if (tx.email) {
              await notifyPaymentDue({
                to: tx.email,
                unitNumber: tx.unit_number,
                amount: milestoneAmount,
                dueDate: dueDate.toLocaleDateString(),
              });
              results.paymentReminders++;

              // Track that reminder was sent
              await sql`
                INSERT INTO payment_reminders (transaction_id, milestone_label, sent_at)
                VALUES (${tx.transaction_id}, ${milestone.label}, NOW())
              `;
            }
          }
        }
      } catch (err: any) {
        results.errors.push(`Payment reminder failed for ${tx.transaction_id}: ${err.message}`);
      }
    }

    // 3. Penalty Calculation: Find overdue payments and calculate penalties
    const overduePayments = await sql`
      WITH confirmed_payments AS (
        SELECT transaction_id, COALESCE(SUM(amount), 0) as paid
        FROM payments
        WHERE status = 'confirmed'
        GROUP BY transaction_id
      )
      SELECT
        t.id as transaction_id,
        t.total_price,
        t.booking_date,
        b.email,
        u.unit_number,
        (pp.milestones) as milestones,
        pp.penalty_rate
      FROM transactions t
      JOIN buyers b ON t.buyer_id = b.id
      JOIN units u ON t.unit_id = u.id
      JOIN payment_plans pp ON t.payment_plan_id = pp.id
      LEFT JOIN confirmed_payments cp ON t.id = cp.transaction_id
      WHERE t.status IN ('confirmed', 'booking_pending')
      AND (cp.paid IS NULL OR cp.paid < t.total_price)
    `;

    for (const tx of overduePayments) {
      try {
        const milestones = tx.milestones as any[];
        const totalPrice = Number(tx.total_price);
        const bookingDate = new Date(tx.booking_date);
        const penaltyRate = Number(tx.penalty_rate || 0.08);

        for (const milestone of milestones) {
          const milestoneAmount = (totalPrice * milestone.percent) / 100;
          const dueDate = new Date(bookingDate);
          dueDate.setDate(dueDate.getDate() + milestone.due_days_from_booking);

          const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysOverdue > 0) {
            // Check if penalty already exists for this milestone
            const existingPenalty = await sql`
              SELECT id FROM penalties
              WHERE transaction_id = ${tx.transaction_id}
              AND milestone_label = ${milestone.label}
              AND status = 'active'
            `;

            if (existingPenalty.length === 0) {
              const penaltyAmount = milestoneAmount * penaltyRate * (daysOverdue / 365);

              await sql`
                INSERT INTO penalties (tenant_id, transaction_id, milestone_label, due_date, days_overdue, penalty_amount, penalty_rate)
                VALUES (
                  (SELECT tenant_id FROM transactions WHERE id = ${tx.transaction_id}),
                  ${tx.transaction_id},
                  ${milestone.label},
                  ${dueDate.toISOString().split('T')[0]},
                  ${daysOverdue},
                  ${Math.round(penaltyAmount * 100) / 100},
                  ${penaltyRate}
                )
              `;
              results.penaltiesCalculated++;
            }
          }
        }
      } catch (err: any) {
        results.errors.push(`Penalty calc failed for ${tx.transaction_id}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
    });
  } catch (err: any) {
    return NextResponse.json({error: err.message}, {status: 500});
  }
}
