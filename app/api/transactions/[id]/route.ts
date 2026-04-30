import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {canCreateTransactions} from '@/lib/roles';
import {z} from 'zod';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

const updateTransactionSchema = z.object({
  status: z.enum(['eoi', 'booking_pending', 'confirmed', 'cancelled']).optional(),
  bookingAmount: z.number().optional(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const transactions = await sql`
    SELECT t.*,
      u.unit_number, u.unit_type, u.price as unit_price,
      b.full_name as buyer_name, b.phone as buyer_phone, b.email as buyer_email,
      a.full_name as agent_name,
      pp.name as payment_plan_name, pp.milestones as payment_plan_milestones
    FROM transactions t
    LEFT JOIN units u ON u.id = t.unit_id
    LEFT JOIN buyers b ON b.id = t.buyer_id
    LEFT JOIN users a ON a.id = t.agent_id
    LEFT JOIN payment_plans pp ON pp.id = t.payment_plan_id
    WHERE t.id = ${id}
    LIMIT 1
  `;

  if (transactions.length === 0) {
    return NextResponse.json({error: 'Transaction not found'}, {status: 404});
  }

  // Get payments
  const payments = await sql`
    SELECT * FROM payments WHERE transaction_id = ${id} ORDER BY created_at DESC
  `;

  return NextResponse.json({transaction: transactions[0], payments});
}

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canCreateTransactions(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  try {
    const {id} = await params;
    const body = await request.json();
    const data = updateTransactionSchema.parse(body);

    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.bookingAmount !== undefined) {
      updates.push(`booking_amount = $${paramIndex++}`);
      values.push(data.bookingAmount);
      updates.push(`booking_date = $${paramIndex++}`);
      values.push(new Date().toISOString());
    }
    if (data.notes) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(data.notes);
    }

    if (updates.length === 0) {
      return NextResponse.json({error: 'No fields to update'}, {status: 400});
    }

    values.push(id);
    values.push(auth.tenantId);

    const query = `
      UPDATE transactions
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await sql([query] as unknown as TemplateStringsArray, ...values);

    if (result.length === 0) {
      return NextResponse.json({error: 'Transaction not found'}, {status: 404});
    }

    // If status changed to confirmed, update unit to booked
    if (data.status === 'confirmed') {
      await sql`UPDATE units SET status = 'booked', updated_at = NOW() WHERE id = (SELECT unit_id FROM transactions WHERE id = ${id})`;
    }

    // If status changed to cancelled, update unit back to available
    if (data.status === 'cancelled') {
      await sql`UPDATE units SET status = 'available', updated_at = NOW() WHERE id = (SELECT unit_id FROM transactions WHERE id = ${id})`;
    }

    return NextResponse.json({transaction: result[0]});
  } catch (error) {
    console.error('Update transaction error:', error);
    return NextResponse.json({error: 'Failed to update transaction'}, {status: 500});
  }
}
