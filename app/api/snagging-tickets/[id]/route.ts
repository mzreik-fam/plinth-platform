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

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;
  const {id} = await params;

  const body = await request.json();

  const result = await sql`
    UPDATE snagging_tickets
    SET
      title = COALESCE(${body.title || null}, title),
      description = COALESCE(${body.description || null}, description),
      severity = COALESCE(${body.severity || null}, severity),
      assigned_to = COALESCE(${body.assigned_to || null}, assigned_to),
      status = COALESCE(${body.status || null}, status),
      buyer_comments = COALESCE(${body.buyer_comments || null}, buyer_comments),
      engineer_comments = COALESCE(${body.engineer_comments || null}, engineer_comments),
      resolved_at = COALESCE(${body.resolved_at || null}, resolved_at),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  if (!result.length) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  // If all tickets for this handover are closed, update handover status
  if (body.status === 'closed') {
    const handoverId = result[0].handover_id;
    const openCount = await sql`
      SELECT COUNT(*) as count FROM snagging_tickets
      WHERE handover_id = ${handoverId} AND status IN ('open', 'in_progress')
    `;
    if (openCount[0].count === '0') {
      await sql`
        UPDATE handovers
        SET status = 'ready_for_handover', updated_at = NOW()
        WHERE id = ${handoverId}
      `;
    }
  }

  return NextResponse.json({ticket: result[0]});
}
