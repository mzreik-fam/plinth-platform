import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';
import {notifyHandoverReady} from '@/lib/email';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

/**
 * Check if all snagging tickets for a handover are closed.
 * If so, auto-advance handover status to 'ready_for_handover'.
 * Returns true if handover was advanced.
 */
async function checkAndAdvanceHandover(handoverId: string, tenantId: string): Promise<boolean> {
  // Count tickets that are NOT in terminal states (closed, resolved)
  const openCount = await sql`
    SELECT COUNT(*) as count FROM snagging_tickets
    WHERE handover_id = ${handoverId} AND status NOT IN ('closed', 'resolved')
  `;

  if (Number(openCount[0].count) === 0) {
    // All tickets are closed/resolved - advance handover status
    await sql`
      UPDATE handovers
      SET status = 'ready_for_handover', updated_at = NOW()
      WHERE id = ${handoverId}
    `;

    // Get handover details for notification
    const handoverData = await sql`
      SELECT h.id, h.unit_id, u.unit_number, t.buyer_id, b.email as buyer_email, b.full_name as buyer_name
      FROM handovers h
      JOIN units u ON h.unit_id = u.id
      JOIN transactions t ON h.transaction_id = t.id
      JOIN buyers b ON t.buyer_id = b.id
      WHERE h.id = ${handoverId}
    `;

    if (handoverData.length > 0) {
      // Notify PM and Super Admin users
      const pmAndAdminUsers = await sql`
        SELECT email, full_name, role
        FROM users
        WHERE tenant_id = ${tenantId}
        AND role IN ('project_manager', 'super_admin')
        AND email IS NOT NULL
      `;

      for (const user of pmAndAdminUsers) {
        await notifyHandoverReady({
          to: user.email,
          recipientName: user.full_name,
          unitNumber: handoverData[0].unit_number,
          handoverId: handoverId,
        });
      }
    }

    return true;
  }

  return false;
}

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;
  const {id} = await params;

  const body = await request.json();

  const existing = await sql`SELECT * FROM snagging_tickets WHERE id = ${id}`;
  if (!existing.length) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  const ticket = existing[0];
  const oldStatus = ticket.status;

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

  const auditAction = body.status ? 'status_change' : 'update';
  await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: auditAction, resourceType: 'snagging_ticket', resourceId: result[0].id, before: existing[0] || null, after: result[0] });

  // If ticket moved to a terminal state (closed or resolved), check if all tickets are done
  const terminalStatuses = ['closed', 'resolved'];
  if (body.status && terminalStatuses.includes(body.status) && !terminalStatuses.includes(oldStatus)) {
    await checkAndAdvanceHandover(ticket.handover_id, auth.tenantId);
  }

  return NextResponse.json({ticket: result[0]});
}

export async function DELETE(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;
  const {id} = await params;

  // Get ticket details before deletion for audit and to know handover_id
  const existing = await sql`SELECT * FROM snagging_tickets WHERE id = ${id}`;
  if (!existing.length) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  const ticket = existing[0];
  const handoverId = ticket.handover_id;
  const wasTerminal = ['closed', 'resolved'].includes(ticket.status);

  // Delete the ticket
  await sql`DELETE FROM snagging_tickets WHERE id = ${id}`;

  await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'delete', resourceType: 'snagging_ticket', resourceId: id, before: ticket, after: null });

  // If the deleted ticket was NOT in terminal state, check if all remaining tickets are done
  // (If it was already terminal, the handover would already be advanced if all others were terminal too)
  if (!wasTerminal) {
    await checkAndAdvanceHandover(handoverId, auth.tenantId);
  }

  return NextResponse.json({success: true, deleted: id});
}
