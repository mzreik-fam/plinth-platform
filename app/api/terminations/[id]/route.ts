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

export async function GET(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;
  const {id} = await params;

  const caseResult = await sql`
    SELECT
      tc.*,
      u.unit_number,
      p.name as project_name,
      b.full_name as buyer_name,
      b.email as buyer_email,
      b.phone as buyer_phone,
      t.total_price,
      t.eoi_amount,
      t.booking_amount
    FROM termination_cases tc
    JOIN units u ON tc.unit_id = u.id
    JOIN projects p ON u.project_id = p.id
    JOIN buyers b ON tc.buyer_id = b.id
    JOIN transactions t ON tc.transaction_id = t.id
    WHERE tc.id = ${id}
  `;

  if (!caseResult.length) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  const steps = await sql`
    SELECT * FROM termination_steps
    WHERE termination_case_id = ${id}
    ORDER BY step_number
  `;

  return NextResponse.json({case: caseResult[0], steps});
}

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;
  const {id} = await params;

  const body = await request.json();

  const result = await sql`
    UPDATE termination_cases
    SET
      reason = COALESCE(${body.reason || null}, reason),
      total_paid = COALESCE(${body.total_paid || null}, total_paid),
      deduction_amount = COALESCE(${body.deduction_amount || null}, deduction_amount),
      refund_amount = COALESCE(${body.refund_amount || null}, refund_amount),
      status = COALESCE(${body.status || null}, status),
      current_step = COALESCE(${body.current_step || null}, current_step),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  if (!result.length) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  return NextResponse.json({case: result[0]});
}
