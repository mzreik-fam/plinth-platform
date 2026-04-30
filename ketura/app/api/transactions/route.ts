import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {canCreateTransactions} from '@/lib/roles';
import {z} from 'zod';
import {randomBytes} from 'crypto';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

const createTransactionSchema = z.object({
  unitId: z.string().uuid(),
  buyerId: z.string().uuid(),
  paymentPlanId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  totalPrice: z.number().positive(),
  eoiAmount: z.number().optional(),
  bookingAmount: z.number().optional(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const transactions = await sql`
    SELECT t.*,
      u.unit_number, u.unit_type,
      b.full_name as buyer_name, b.phone as buyer_phone,
      a.full_name as agent_name
    FROM transactions t
    LEFT JOIN units u ON u.id = t.unit_id
    LEFT JOIN buyers b ON b.id = t.buyer_id
    LEFT JOIN users a ON a.id = t.agent_id
    ORDER BY t.created_at DESC
  `;

  return NextResponse.json({transactions});
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canCreateTransactions(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  try {
    const body = await request.json();
    const data = createTransactionSchema.parse(body);

    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    // Check unit is available
    const unitCheck = await sql`SELECT status FROM units WHERE id = ${data.unitId}`;
    if (unitCheck.length === 0) {
      return NextResponse.json({error: 'Unit not found'}, {status: 404});
    }
    if (unitCheck[0].status !== 'available' && unitCheck[0].status !== 'draft') {
      return NextResponse.json({error: 'Unit is not available'}, {status: 400});
    }

    const portalToken = randomBytes(32).toString('hex');

    const result = await sql`
      INSERT INTO transactions (
        tenant_id, unit_id, buyer_id, payment_plan_id, agent_id,
        status, eoi_amount, eoi_date, booking_amount, total_price, portal_token, notes
      ) VALUES (
        ${auth.tenantId}, ${data.unitId}, ${data.buyerId},
        ${data.paymentPlanId || null}, ${data.agentId || null},
        'eoi', ${data.eoiAmount || null}, ${data.eoiAmount ? new Date().toISOString() : null},
        ${data.bookingAmount || null}, ${data.totalPrice}, ${portalToken}, ${data.notes || null}
      )
      RETURNING *
    `;

    // Update unit status to pre_booked
    await sql`UPDATE units SET status = 'pre_booked', updated_at = NOW() WHERE id = ${data.unitId}`;

    return NextResponse.json({transaction: result[0]}, {status: 201});
  } catch (error) {
    console.error('Create transaction error:', error);
    return NextResponse.json({error: 'Failed to create transaction'}, {status: 500});
  }
}
