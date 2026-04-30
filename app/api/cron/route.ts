import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {notifyPaymentDue} from '@/lib/email';

// This endpoint is called by Vercel Cron or manually
// It processes: EOI expiry, payment due reminders, penalty calculations

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const results = {
    eoiExpired: 0,
    paymentReminders: 0,
    penaltiesCalculated: 0,
    errors: [] as string[],
  };

  try {
    // 1. EOI Auto-Release: Find EOI transactions past expiry (7 days default)
    const expiredEois = await sql`
      SELECT t.id, t.unit_id, t.eoi_date, t.buyer_id, u.unit_number
      FROM transactions t
      JOIN units u ON t.unit_id = u.id
      WHERE t.status = 'eoi'
      AND t.eoi_date < NOW() - INTERVAL '7 days'
    `;

    for (const eoi of expiredEois) {
      try {
        // Cancel transaction
        await sql`UPDATE transactions SET status = 'cancelled', updated_at = NOW() WHERE id = ${eoi.id}`;
        // Release unit back to available
        await sql`UPDATE units SET status = 'available', updated_at = NOW() WHERE id = ${eoi.unit_id}`;
        results.eoiExpired++;
      } catch (err: any) {
        results.errors.push(`EOI expiry failed for ${eoi.id}: ${err.message}`);
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

          // Check if payment for this milestone is already recorded
          const existingPayment = await sql`
            SELECT COALESCE(SUM(amount), 0) as paid
            FROM payments
            WHERE transaction_id = ${tx.transaction_id}
            AND status = 'confirmed'
          `;

          const totalPaid = Number(existingPayment[0]?.paid || 0);

          // If not fully paid and due date is within 7 days
          if (totalPaid < totalPrice && dueDate > new Date() && dueDate < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) {
            if (tx.email) {
              await notifyPaymentDue({
                to: tx.email,
                unitNumber: tx.unit_number,
                amount: milestoneAmount,
                dueDate: dueDate.toLocaleDateString(),
              });
              results.paymentReminders++;
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
