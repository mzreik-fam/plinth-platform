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

  // Unit availability counts
  const unitStats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'available') as available,
      COUNT(*) FILTER (WHERE status = 'pre_booked') as pre_booked,
      COUNT(*) FILTER (WHERE status = 'booked') as booked,
      COUNT(*) FILTER (WHERE status = 'handed_over') as handed_over,
      COUNT(*) FILTER (WHERE status = 'terminated') as terminated,
      COUNT(*) FILTER (WHERE status = 'draft') as draft,
      COUNT(*) as total
    FROM units
  `;

  // Sales pipeline
  const salesStats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'eoi') as eoi_count,
      COUNT(*) FILTER (WHERE status = 'booking_pending') as booking_pending_count,
      COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_count,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
      COALESCE(SUM(total_price) FILTER (WHERE status = 'confirmed'), 0) as total_revenue,
      COALESCE(SUM(eoi_amount) FILTER (WHERE status = 'eoi'), 0) as eoi_pipeline
    FROM transactions
  `;

  // Payments due: calculate from payment plan milestones minus confirmed payments
  const upcomingPaymentsResult = await sql`
    WITH confirmed_payments AS (
      SELECT transaction_id, COALESCE(SUM(amount), 0) as paid
      FROM payments
      WHERE status = 'confirmed'
      GROUP BY transaction_id
    ),
    transaction_milestones AS (
      SELECT
        t.id as transaction_id,
        t.total_price,
        t.booking_date,
        t.status,
        (pp.milestones) as milestones
      FROM transactions t
      JOIN payment_plans pp ON t.payment_plan_id = pp.id
      WHERE t.status IN ('confirmed', 'booking_pending')
    )
    SELECT COUNT(*) as count FROM transaction_milestones tm
    LEFT JOIN confirmed_payments cp ON tm.transaction_id = cp.transaction_id
    WHERE (cp.paid IS NULL OR cp.paid < tm.total_price)
  `;

  // Combined counts: pending approvals, active handovers, terminations, snagging, penalties, notifications
  const combinedStats = await sql`
    SELECT
      (SELECT COUNT(*) FROM unit_approvals WHERE status = 'pending') as pending_approvals,
      (SELECT COUNT(*) FROM handovers WHERE status NOT IN ('completed')) as active_handovers,
      (SELECT COUNT(*) FROM termination_cases WHERE status = 'active') as active_terminations,
      (SELECT COUNT(*) FROM snagging_tickets WHERE status IN ('open', 'in_progress')) as open_snagging,
      (SELECT COALESCE(SUM(penalty_amount), 0) FROM penalties WHERE status = 'active') as penalty_total,
      (SELECT COUNT(*) FROM penalties WHERE status = 'active') as penalty_count,
      (SELECT COUNT(*) FROM notifications WHERE user_id = ${auth.userId} AND is_read = false) as unread_count
  `;

  return NextResponse.json({
    units: unitStats[0],
    sales: salesStats[0],
    upcomingPayments: Number(upcomingPaymentsResult[0]?.count) || 0,
    pendingApprovals: Number(combinedStats[0]?.pending_approvals) || 0,
    activeHandovers: Number(combinedStats[0]?.active_handovers) || 0,
    activeTerminations: Number(combinedStats[0]?.active_terminations) || 0,
    openSnagging: Number(combinedStats[0]?.open_snagging) || 0,
    penalties: { count: Number(combinedStats[0]?.penalty_count) || 0, total: Number(combinedStats[0]?.penalty_total) || 0 },
    notifications: { unread: Number(combinedStats[0]?.unread_count) || 0 },
  }, {
    headers: {'Cache-Control': 'private, max-age=30'},
  });
}
