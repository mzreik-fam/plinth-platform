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

export async function GET(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;
  const {id} = await params;

  const handover = await sql`
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
    WHERE h.id = ${id}
  `;

  if (!handover.length) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  // Get snagging tickets for this handover
  const tickets = await sql`
    SELECT * FROM snagging_tickets
    WHERE handover_id = ${id}
    ORDER BY created_at DESC
  `;

  return NextResponse.json({handover: handover[0], tickets});
}

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;
  const {id} = await params;

  const body = await request.json();

  const existing = await sql`SELECT * FROM handovers WHERE id = ${id}`;

  const result = await sql`
    UPDATE handovers
    SET
      bcc_uploaded_at = COALESCE(${body.bcc_uploaded_at ?? null}, bcc_uploaded_at),
      bcc_document_url = COALESCE(${body.bcc_document_url ?? null}, bcc_document_url),
      completion_notice_sent_at = COALESCE(${body.completion_notice_sent_at ?? null}, completion_notice_sent_at),
      handover_payment_amount = COALESCE(${body.handover_payment_amount ?? null}, handover_payment_amount),
      handover_payment_paid_at = COALESCE(${body.handover_payment_paid_at ?? null}, handover_payment_paid_at),
      dld_registration_confirmed = CASE WHEN ${body.dld_registration_confirmed !== undefined} THEN ${body.dld_registration_confirmed} ELSE dld_registration_confirmed END,
      oqood_paid = CASE WHEN ${body.oqood_paid !== undefined} THEN ${body.oqood_paid} ELSE oqood_paid END,
      utility_registration_confirmed = CASE WHEN ${body.utility_registration_confirmed !== undefined} THEN ${body.utility_registration_confirmed} ELSE utility_registration_confirmed END,
      inspection_date = COALESCE(${body.inspection_date ?? null}, inspection_date),
      inspection_notes = COALESCE(${body.inspection_notes ?? null}, inspection_notes),
      inspection_photos = COALESCE(${body.inspection_photos ? JSON.stringify(body.inspection_photos) : null}, inspection_photos),
      key_handover_signed_at = COALESCE(${body.key_handover_signed_at ?? null}, key_handover_signed_at),
      key_handover_document_url = COALESCE(${body.key_handover_document_url ?? null}, key_handover_document_url),
      status = COALESCE(${body.status ?? null}, status),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  if (!result.length) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  const auditAction = body.status ? 'status_change' : 'update';
  await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: auditAction, resourceType: 'handover', resourceId: result[0].id, before: existing[0] || null, after: result[0] });

  // If status changed to completed, update unit status
  if (body.status === 'completed') {
    await sql`
      UPDATE units
      SET status = 'handed_over', updated_at = NOW()
      WHERE id = (SELECT unit_id FROM handovers WHERE id = ${id})
    `;
  }

  return NextResponse.json({handover: result[0]});
}
