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

  const buyers = await sql`
    SELECT id, full_name, email, phone, emirates_id, nationality, created_at
    FROM buyers
    ORDER BY created_at DESC
  `;

  return NextResponse.json({buyers});
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  try {
    const body = await request.json();
    const {fullName, email, phone, emiratesId, passportNumber, nationality, address} = body;

    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const result = await sql`
      INSERT INTO buyers (tenant_id, full_name, email, phone, emirates_id, passport_number, nationality, address)
      VALUES (${auth.tenantId}, ${fullName}, ${email || null}, ${phone}, ${emiratesId || null}, ${passportNumber || null}, ${nationality || null}, ${address || null})
      RETURNING *
    `;

    return NextResponse.json({buyer: result[0]}, {status: 201});
  } catch (error) {
    console.error('Create buyer error:', error);
    return NextResponse.json({error: 'Failed to create buyer'}, {status: 500});
  }
}
