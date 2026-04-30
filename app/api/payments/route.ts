import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';
import {canRecordPayments} from '@/lib/roles';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canRecordPayments(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  try {
    const body = await request.json();
    const {transaction_id, amount, payment_method, reference_number, proof_document_id} = body;

    if (!transaction_id || !amount || !payment_method) {
      return NextResponse.json({error: 'Transaction, amount and payment method required'}, {status: 400});
    }

    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    // Insert payment as 'pending' - requires admin review before confirmation
    const result = await sql`
      INSERT INTO payments (tenant_id, transaction_id, amount, payment_method, reference_number, status, proof_document_id)
      VALUES (${auth.tenantId}, ${transaction_id}, ${amount}, ${payment_method}, ${reference_number || null}, 'pending', ${proof_document_id || null})
      RETURNING *
    `;

    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'create', resourceType: 'payment', resourceId: result[0].id, before: null, after: result[0] });

    return NextResponse.json({payment: result[0]}, {status: 201});
  } catch (error) {
    console.error('Create payment error:', error);
    return NextResponse.json({error: 'Failed to record payment'}, {status: 500});
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const {searchParams} = new URL(request.url);
    const status = searchParams.get('status');

    let payments;
    if (status) {
      payments = await sql`
        SELECT 
          p.*,
          u.unit_number,
          b.full_name as buyer_name,
          d.url as proof_document_url
        FROM payments p
        JOIN transactions t ON p.transaction_id = t.id
        JOIN units u ON t.unit_id = u.id
        JOIN buyers b ON t.buyer_id = b.id
        LEFT JOIN documents d ON p.proof_document_id = d.id
        WHERE p.tenant_id = ${auth.tenantId} AND p.status = ${status}
        ORDER BY p.created_at DESC
      `;
    } else {
      payments = await sql`
        SELECT 
          p.*,
          u.unit_number,
          b.full_name as buyer_name,
          d.url as proof_document_url
        FROM payments p
        JOIN transactions t ON p.transaction_id = t.id
        JOIN units u ON t.unit_id = u.id
        JOIN buyers b ON t.buyer_id = b.id
        LEFT JOIN documents d ON p.proof_document_id = d.id
        WHERE p.tenant_id = ${auth.tenantId}
        ORDER BY p.created_at DESC
      `;
    }

    return NextResponse.json({payments});
  } catch (err: any) {
    console.error('List payments error:', err);
    return NextResponse.json({error: err.message}, {status: 500});
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const body = await request.json();
    const {id, status} = body;

    if (!id || !status) {
      return NextResponse.json({error: 'Payment ID and status required'}, {status: 400});
    }

    // Note: Confirmation is now handled by PATCH /api/payments/[id] with proper audit trail
    // This endpoint is kept for other status updates (e.g., 'rejected')
    if (status === 'confirmed') {
      return NextResponse.json({error: 'Use PATCH /api/payments/[id] to confirm payments'}, {status: 400});
    }

    const existing = await sql`SELECT * FROM payments WHERE id = ${id}`;

    const result = await sql`
      UPDATE payments
      SET status = ${status}
      WHERE id = ${id}
      RETURNING *
    `;

    const auditAction = status === 'rejected' ? 'status_change' : 'update';
    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: auditAction, resourceType: 'payment', resourceId: result[0].id, before: existing[0] || null, after: result[0] });

    return NextResponse.json({payment: result[0]});
  } catch (err: any) {
    return NextResponse.json({error: err.message}, {status: 500});
  }
}
