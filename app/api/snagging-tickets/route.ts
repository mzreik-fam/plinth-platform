import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';
import {notifySnaggingTicketCreated} from '@/lib/email';

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
  const handoverId = searchParams.get('handover_id');
  const status = searchParams.get('status');

  const tickets = await sql`
    SELECT
      st.*,
      u.full_name as assigned_name
    FROM snagging_tickets st
    LEFT JOIN users u ON st.assigned_to = u.id
    WHERE 1=1
    ${handoverId ? sql`AND st.handover_id = ${handoverId}` : sql``}
    ${status ? sql`AND st.status = ${status}` : sql``}
    ORDER BY st.created_at DESC
  `;

  return NextResponse.json({tickets});
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const body = await request.json();
  const {handover_id, unit_id, title, description, severity, assigned_to} = body;

  if (!handover_id || !unit_id || !title) {
    return NextResponse.json({error: 'Handover, unit and title required'}, {status: 400});
  }

  const result = await sql`
    INSERT INTO snagging_tickets (tenant_id, handover_id, unit_id, title, description, severity, assigned_to)
    VALUES (${auth.tenantId}, ${handover_id}, ${unit_id}, ${title}, ${description || null}, ${severity || 'minor'}, ${assigned_to || null})
    RETURNING *
  `;

  // Notify buyer about snagging ticket
  const buyerData = await sql`
    SELECT b.email, u.unit_number
    FROM handovers h
    JOIN transactions t ON h.transaction_id = t.id
    JOIN buyers b ON t.buyer_id = b.id
    JOIN units u ON h.unit_id = u.id
    WHERE h.id = ${handover_id}
  `;

  if (buyerData.length > 0 && buyerData[0].email) {
    await notifySnaggingTicketCreated({
      to: buyerData[0].email,
      unitNumber: buyerData[0].unit_number,
      ticketTitle: title,
    });
  }

  await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'create', resourceType: 'snagging_ticket', resourceId: result[0].id, before: null, after: result[0] });

  return NextResponse.json({ticket: result[0]});
}
