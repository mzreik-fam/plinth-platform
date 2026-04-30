import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;
  const {id} = await params;

  const body = await request.json();

  const existing = await sql`SELECT * FROM termination_steps WHERE id = ${id}`;

  const result = await sql`
    UPDATE termination_steps
    SET
      status = COALESCE(${body.status || null}, status),
      notice_sent_at = COALESCE(${body.notice_sent_at || null}, notice_sent_at),
      notice_method = COALESCE(${body.notice_method || null}, notice_method),
      courier_tracking = COALESCE(${body.courier_tracking || null}, courier_tracking),
      airway_bill_url = COALESCE(${body.airway_bill_url || null}, airway_bill_url),
      email_proof_url = COALESCE(${body.email_proof_url || null}, email_proof_url),
      receipt_confirmed_at = COALESCE(${body.receipt_confirmed_at || null}, receipt_confirmed_at),
      notes = COALESCE(${body.notes || null}, notes),
      completed_at = COALESCE(${body.completed_at || null}, completed_at)
    WHERE id = ${id}
    RETURNING *
  `;

  if (!result.length) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  const auditAction = body.status === 'completed' ? 'status_change' : 'update';
  await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: auditAction, resourceType: 'termination_step', resourceId: result[0].id, before: existing[0] || null, after: result[0] });

  // If step completed, check if we should advance the case
  if (body.status === 'completed') {
    const caseId = result[0].termination_case_id;
    const stepNum = result[0].step_number;

    // Update case current step
    await sql`
      UPDATE termination_cases
      SET current_step = ${stepNum + 1}, updated_at = NOW()
      WHERE id = ${caseId}
    `;

    // If step 4 completed, mark case as completed
    if (stepNum === 4) {
      await sql`
        UPDATE termination_cases
        SET status = 'completed', updated_at = NOW()
        WHERE id = ${caseId}
      `;
    }
  }

  return NextResponse.json({step: result[0]});
}
