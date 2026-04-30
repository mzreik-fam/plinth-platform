import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {notifyHandoverStarted} from '@/lib/email';

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
  const status = searchParams.get('status');

  const handovers = await sql`
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
    ${status ? sql`WHERE h.status = ${status}` : sql``}
    ORDER BY h.created_at DESC
  `;

  return NextResponse.json({handovers});
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const body = await request.json();
  const {transaction_id, unit_id} = body;

  if (!transaction_id || !unit_id) {
    return NextResponse.json({error: 'Transaction and unit required'}, {status: 400});
  }

  // Verify transaction exists and is confirmed
  const tx = await sql`SELECT * FROM transactions WHERE id = ${transaction_id} AND status = 'confirmed'`;
  if (!tx.length) {
    return NextResponse.json({error: 'Transaction not found or not confirmed'}, {status: 400});
  }

  const result = await sql`
    INSERT INTO handovers (tenant_id, transaction_id, unit_id, status)
    VALUES (${auth.tenantId}, ${transaction_id}, ${unit_id}, 'pending_bcc')
    RETURNING *
  `;

  // Notify buyer that handover has started
  const buyerData = await sql`
    SELECT b.email, u.unit_number
    FROM transactions t
    JOIN buyers b ON t.buyer_id = b.id
    JOIN units u ON t.unit_id = u.id
    WHERE t.id = ${transaction_id}
  `;

  if (buyerData.length > 0 && buyerData[0].email) {
    await notifyHandoverStarted({
      to: buyerData[0].email,
      unitNumber: buyerData[0].unit_number,
    });
  }

  return NextResponse.json({handover: result[0]});
}
