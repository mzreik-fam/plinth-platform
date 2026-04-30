import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';
import {notifyHandoverStarted} from '@/lib/email';
import {requireRole} from '@/lib/permissions';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const {searchParams} = new URL(request.url);
  const status = searchParams.get('status');

  const handovers = await sql`
    SELECT
      h.*,
      u.unit_number,
      p.name as project_name,
      t.total_price,
      b.full_name as buyer_name,
      b.email as buyer_email,
      b.phone as buyer_phone
    FROM handovers h
    JOIN units u ON h.unit_id = u.id
    JOIN projects p ON u.project_id = p.id
    JOIN transactions t ON h.transaction_id = t.id
    JOIN buyers b ON t.buyer_id = b.id
    ${status ? sql`WHERE h.status = ${status}` : sql``}
    ORDER BY h.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json({handovers}, {
    headers: {'Cache-Control': 'private, max-age=30'},
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  // P0-6: Only super_admin or project_manager can initiate handover
  try {
    requireRole(['super_admin', 'project_manager'])(auth);
  } catch (e) {
    return NextResponse.json({error: 'Forbidden: Only Super Admin or Project Manager can initiate handover'}, {status: 403});
  }

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const body = await request.json();
  const {transaction_id, unit_id, bcc_document_url} = body;

  if (!transaction_id || !unit_id) {
    return NextResponse.json({error: 'Transaction and unit required'}, {status: 400});
  }

  // Verify transaction exists and is confirmed
  const tx = await sql`SELECT * FROM transactions WHERE id = ${transaction_id} AND status = 'confirmed'`;
  if (!tx.length) {
    return NextResponse.json({error: 'Transaction not found or not confirmed'}, {status: 400});
  }

  const transaction = tx[0];

  // Check for existing handover
  const existing = await sql`SELECT id FROM handovers WHERE transaction_id = ${transaction_id}`;
  if (existing.length > 0) {
    return NextResponse.json({error: 'Handover already exists for this transaction'}, {status: 409});
  }

  // P0-6: Validate BCC document is provided
  if (!bcc_document_url) {
    return NextResponse.json({error: 'Handover cannot start: Building Completion Certificate (BCC) document is required.'}, {status: 400});
  }

  // P0-6: Validate zero balance (all milestones except final handover installment paid)
  const totalPrice = Number(transaction.total_price);
  
  // Get confirmed payments total
  const paymentResult = await sql`
    SELECT COALESCE(SUM(amount), 0) as total_paid
    FROM payments 
    WHERE transaction_id = ${transaction_id} AND status = 'confirmed'
  `;
  const totalPaid = Number(paymentResult[0]?.total_paid || 0);
  
  // Get payment plan to identify final milestone amount
  const planResult = await sql`
    SELECT pp.milestones
    FROM transactions t
    LEFT JOIN payment_plans pp ON t.payment_plan_id = pp.id
    WHERE t.id = ${transaction_id}
  `;
  
  let requiredPayment = totalPrice;
  
  if (planResult.length > 0 && planResult[0]?.milestones) {
    const milestones = planResult[0].milestones as {label?: string; percent?: number}[];
    // Find the final milestone (typically labeled "Final" or last in array)
    const finalMilestone = milestones.find((m: {label?: string; percent?: number}) => 
      m.label?.toLowerCase().includes('final') || 
      m.label?.toLowerCase().includes('handover')
    ) || milestones[milestones.length - 1]; // Fallback to last milestone
    
    if (finalMilestone?.percent) {
      const finalMilestoneAmount = (totalPrice * Number(finalMilestone.percent)) / 100;
      // Zero balance means all payments EXCEPT the final handover installment
      requiredPayment = totalPrice - finalMilestoneAmount;
    }
  }
  
  // Check if all non-final milestones are paid (with small tolerance for rounding)
  if (totalPaid < requiredPayment - 0.01) {
    const remaining = requiredPayment - totalPaid;
    return NextResponse.json({
      error: `Handover cannot start: Outstanding balance of AED ${remaining.toLocaleString()} must be paid before handover. Total paid: AED ${totalPaid.toLocaleString()}, Required: AED ${requiredPayment.toLocaleString()}.`,
      details: {
        total_paid: totalPaid,
        total_price: totalPrice,
        required_before_handover: requiredPayment,
        remaining_balance: remaining
      }
    }, {status: 400});
  }

  const result = await sql`
    INSERT INTO handovers (tenant_id, transaction_id, unit_id, status, bcc_document_url, bcc_uploaded_at)
    VALUES (${auth.tenantId}, ${transaction_id}, ${unit_id}, 'pending_bcc', ${bcc_document_url}, NOW())
    RETURNING *
  `;

  // Notify buyer that handover has started
  const buyerData = await sql`
    SELECT b.email, u.unit_number
    FROM transactions t
    JOIN buyers b ON t.buyer_id = b.id
    JOIN units u ON t.unit_id = u.id
    WHERE t.id = ${transaction_id}
  `;

  if (buyerData.length > 0 && buyerData[0].email) {
    await notifyHandoverStarted({
      to: buyerData[0].email,
      unitNumber: buyerData[0].unit_number,
    });
  }

  await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'create', resourceType: 'handover', resourceId: result[0].id, before: null, after: result[0] });

  return NextResponse.json({handover: result[0]});
}
