import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';
import {canRecordPayments} from '@/lib/roles';
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

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canRecordPayments(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  try {
    const body = await request.json();
    const {transaction_id, amount, payment_method, reference_number} = body;

    if (!transaction_id || !amount || !payment_method) {
      return NextResponse.json({error: 'Transaction, amount and payment method required'}, {status: 400});
    }

    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const result = await sql`
      INSERT INTO payments (tenant_id, transaction_id, amount, payment_method, reference_number, status, confirmed_by, confirmed_at)
      VALUES (${auth.tenantId}, ${transaction_id}, ${amount}, ${payment_method}, ${reference_number || null}, 'confirmed', ${auth.userId}, NOW())
      RETURNING *
    `;

    // Notify buyer about confirmed payment
    const txData = await sql`
      SELECT t.unit_id, t.buyer_id, u.unit_number, b.email as buyer_email
      FROM transactions t
      JOIN units u ON t.unit_id = u.id
      JOIN buyers b ON t.buyer_id = b.id
      WHERE t.id = ${transaction_id}
    `;

    if (txData.length > 0 && txData[0].buyer_email) {
      await notifyPaymentReceived({
        to: txData[0].buyer_email,
        unitNumber: txData[0].unit_number,
        amount: Number(amount),
        transactionId: transaction_id,
      });
    }

    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'create', resourceType: 'payment', resourceId: result[0].id, before: null, after: result[0] });

    return NextResponse.json({payment: result[0]}, {status: 201});
  } catch (error) {
    console.error('Create payment error:', error);
    return NextResponse.json({error: 'Failed to record payment'}, {status: 500});
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

    const existing = await sql`SELECT * FROM payments WHERE id = ${id}`;

    const result = await sql`
      UPDATE payments
      SET status = ${status},
          confirmed_by = ${status === 'confirmed' ? auth.userId : null},
          confirmed_at = ${status === 'confirmed' ? new Date().toISOString() : null}
      WHERE id = ${id}
      RETURNING *
    `;

    // If confirming a pending payment, notify buyer
    if (status === 'confirmed') {
      const paymentData = await sql`
        SELECT p.transaction_id, p.amount, t.buyer_id, u.unit_number, b.email as buyer_email
        FROM payments p
        JOIN transactions t ON p.transaction_id = t.id
        JOIN units u ON t.unit_id = u.id
        JOIN buyers b ON t.buyer_id = b.id
        WHERE p.id = ${id}
      `;

      if (paymentData.length > 0 && paymentData[0].buyer_email) {
        await notifyPaymentReceived({
          to: paymentData[0].buyer_email,
          unitNumber: paymentData[0].unit_number,
          amount: Number(paymentData[0].amount),
          transactionId: paymentData[0].transaction_id,
        });
      }
    }

    const auditAction = status === 'confirmed' ? 'status_change' : 'update';
    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: auditAction, resourceType: 'payment', resourceId: result[0].id, before: existing[0] || null, after: result[0] });

    return NextResponse.json({payment: result[0]});
  } catch (err: any) {
    return NextResponse.json({error: err.message}, {status: 500});
  }
}
