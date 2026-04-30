import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {notifyTerminationStep} from '@/lib/email';

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

    // Notify buyer about termination step progress
    const buyerData = await sql`
      SELECT b.email, tc.reason
      FROM termination_cases tc
      JOIN buyers b ON tc.buyer_id = b.id
      WHERE tc.id = ${caseId}
    `;

    if (buyerData.length > 0 && buyerData[0].email) {
      await notifyTerminationStep({
        to: buyerData[0].email,
        stepName: result[0].step_name,
        deadline: result[0].deadline_date ? new Date(result[0].deadline_date).toLocaleDateString() : 'N/A',
      });
    }
  }

  return NextResponse.json({step: result[0]});
}
