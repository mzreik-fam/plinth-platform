import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';
import {requireSuperAdmin, roleGuard} from '@/lib/permissions';
import {notifyPaymentReceived} from '@/lib/email';

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
 * PATCH /api/payments/[id]
 * 
 * Confirms or rejects a pending payment.
 * Only Super Admin or Admin can confirm payments.
 * 
 * Body: { action: 'confirm' | 'reject', notes?: string }
 */
export async function PATCH(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  // Only admin or super_admin can confirm/reject payments
  const guard = roleGuard(['super_admin', 'admin']);
  const forbidden = guard(auth);
  if (forbidden) return NextResponse.json({error: forbidden.error}, {status: forbidden.status});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const {id} = await params;
    const body = await request.json();
    const {action, notes} = body;

    if (!action || !['confirm', 'reject'].includes(action)) {
      return NextResponse.json({error: "Action must be 'confirm' or 'reject'"}, {status: 400});
    }

    // Fetch existing payment with transaction details
    const existing = await sql`
      SELECT p.*, t.buyer_id, t.unit_id, u.unit_number, b.email as buyer_email
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.id
      JOIN units u ON t.unit_id = u.id
      JOIN buyers b ON t.buyer_id = b.id
      WHERE p.id = ${id}
    `;

    if (existing.length === 0) {
      return NextResponse.json({error: 'Payment not found'}, {status: 404});
    }

    const payment = existing[0];

    // Only pending payments can be confirmed or rejected
    if (payment.status !== 'pending') {
      return NextResponse.json({error: `Payment is already ${payment.status}`}, {status: 400});
    }

    const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';
    const before = {status: payment.status, confirmed_by: payment.confirmed_by, confirmed_at: payment.confirmed_at};

    // Update payment status
    const result = await sql`
      UPDATE payments
      SET 
        status = ${newStatus},
        confirmed_by = ${action === 'confirm' ? auth.userId : null},
        confirmed_at = ${action === 'confirm' ? new Date().toISOString() : null},
        notes = ${notes || payment.notes || null}
      WHERE id = ${id}
      RETURNING *
    `;

    const after = {
      status: result[0].status, 
      confirmed_by: result[0].confirmed_by, 
      confirmed_at: result[0].confirmed_at,
      notes: result[0].notes
    };

    // Log the state change to audit log
    await logAudit({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: 'status_change',
      resourceType: 'payment',
      resourceId: id,
      before,
      after
    });

    // Only send email notification on confirmation (not on rejection)
    if (action === 'confirm' && payment.buyer_email) {
      await notifyPaymentReceived({
        to: payment.buyer_email,
        unitNumber: payment.unit_number,
        amount: Number(payment.amount),
        transactionId: payment.transaction_id,
      });
    }

    return NextResponse.json({payment: result[0]});
  } catch (err: unknown) {
    console.error('Payment confirmation error:', err);
    return NextResponse.json({error: (err as Error).message}, {status: 500});
  }
}

/**
 * GET /api/payments/[id]
 * 
 * Fetches a single payment with full details.
 */
export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const {id} = await params;

    const result = await sql`
      SELECT 
        p.*,
        u.unit_number,
        b.full_name as buyer_name,
        b.email as buyer_email,
        confirmer.full_name as confirmed_by_name,
        d.url as proof_document_url
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.id
      JOIN units u ON t.unit_id = u.id
      JOIN buyers b ON t.buyer_id = b.id
      LEFT JOIN users confirmer ON p.confirmed_by = confirmer.id
      LEFT JOIN documents d ON p.proof_document_id = d.id
      WHERE p.id = ${id}
    `;

    if (result.length === 0) {
      return NextResponse.json({error: 'Payment not found'}, {status: 404});
    }

    return NextResponse.json({payment: result[0]});
  } catch (err: unknown) {
    console.error('Get payment error:', err);
    return NextResponse.json({error: (err as Error).message}, {status: 500});
  }
}
