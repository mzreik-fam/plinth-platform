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
  const status = searchParams.get('status');

  const cases = await sql`
    SELECT
      tc.*,
      u.unit_number,
      p.name as project_name,
      b.full_name as buyer_name,
      t.total_price,
      t.eoi_amount,
      t.booking_amount
    FROM termination_cases tc
    JOIN units u ON tc.unit_id = u.id
    JOIN projects p ON u.project_id = p.id
    JOIN buyers b ON tc.buyer_id = b.id
    JOIN transactions t ON tc.transaction_id = t.id
    ${status ? sql`WHERE tc.status = ${status}` : sql``}
    ORDER BY tc.created_at DESC
  `;

  return NextResponse.json({cases});
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const body = await request.json();
  const {transaction_id, unit_id, buyer_id, reason, total_paid, deduction_amount, refund_amount} = body;

  if (!transaction_id || !unit_id || !buyer_id) {
    return NextResponse.json({error: 'Transaction, unit and buyer required'}, {status: 400});
  }

  const result = await sql`
    INSERT INTO termination_cases (tenant_id, transaction_id, unit_id, buyer_id, initiated_by, reason, total_paid, deduction_amount, refund_amount)
    VALUES (${auth.tenantId}, ${transaction_id}, ${unit_id}, ${buyer_id}, ${auth.userId}, ${reason || null}, ${total_paid || 0}, ${deduction_amount || 0}, ${refund_amount || 0})
    RETURNING *
  `;

  // Create the 4 DLD steps
  const caseId = result[0].id;
  const steps = [
    {step_number: 1, step_name: 'Completion Notice (CN)', deadline_days: 0},
    {step_number: 2, step_name: 'Developer Notice (DN)', deadline_days: 30},
    {step_number: 3, step_name: 'DLD Termination Notice', deadline_days: 60},
    {step_number: 4, step_name: 'Execution Request to DLD', deadline_days: 90},
  ];

  for (const step of steps) {
    await sql`
      INSERT INTO termination_steps (tenant_id, termination_case_id, step_number, step_name, deadline_date)
      VALUES (
        ${auth.tenantId},
        ${caseId},
        ${step.step_number},
        ${step.step_name},
        CURRENT_DATE + (${step.deadline_days} * INTERVAL '1 day')
      )
    `;
  }

  // Update transaction status
  await sql`UPDATE transactions SET status = 'terminated', updated_at = NOW() WHERE id = ${transaction_id}`;
  await sql`UPDATE units SET status = 'terminated', updated_at = NOW() WHERE id = ${unit_id}`;

  return NextResponse.json({case: result[0]});
}
