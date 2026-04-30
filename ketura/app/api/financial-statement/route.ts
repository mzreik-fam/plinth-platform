import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';

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
  const transactionId = searchParams.get('transaction_id');

  if (!transactionId) {
    return NextResponse.json({error: 'Transaction ID required'}, {status: 400});
  }

  // Transaction details
  const transaction = await sql`
    SELECT
      t.*,
      u.unit_number,
      p.name as project_name,
      b.full_name as buyer_name,
      b.email as buyer_email,
      b.phone as buyer_phone,
      pp.name as payment_plan_name,
      pp.milestones as payment_plan_milestones,
      pp.penalty_rate,
      a.full_name as agent_name
    FROM transactions t
    JOIN units u ON t.unit_id = u.id
    JOIN projects p ON u.project_id = p.id
    JOIN buyers b ON t.buyer_id = b.id
    LEFT JOIN payment_plans pp ON t.payment_plan_id = pp.id
    LEFT JOIN users a ON t.agent_id = a.id
    WHERE t.id = ${transactionId}
  `;

  if (!transaction.length) {
    return NextResponse.json({error: 'Transaction not found'}, {status: 404});
  }

  // Payments
  const payments = await sql`
    SELECT
      pay.*,
      u.full_name as confirmed_by_name
    FROM payments pay
    LEFT JOIN users u ON pay.confirmed_by = u.id
    WHERE pay.transaction_id = ${transactionId}
    ORDER BY pay.created_at DESC
  `;

  // Penalties
  const penalties = await sql`
    SELECT * FROM penalties
    WHERE transaction_id = ${transactionId}
    ORDER BY created_at DESC
  `;

  // Documents
  const documents = await sql`
    SELECT
      d.*,
      u.full_name as uploaded_by_name
    FROM documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.transaction_id = ${transactionId}
    ORDER BY d.created_at DESC
  `;

  // Calculate financial summary
  const totalPaid = payments
    .filter((p: any) => p.status === 'confirmed')
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  const totalPending = payments
    .filter((p: any) => p.status === 'pending')
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  const totalPenalties = penalties
    .filter((p: any) => p.status === 'active')
    .reduce((sum: number, p: any) => sum + Number(p.penalty_amount), 0);

  const totalPrice = Number(transaction[0].total_price);
  const outstanding = totalPrice - totalPaid + totalPenalties;

  return NextResponse.json({
    transaction: transaction[0],
    payments,
    penalties,
    documents,
    summary: {
      totalPrice,
      totalPaid,
      totalPending,
      totalPenalties,
      outstanding,
      progressPercent: totalPrice > 0 ? Math.round((totalPaid / totalPrice) * 100) : 0,
    },
  });
}
