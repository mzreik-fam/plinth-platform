import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const buyers = await sql`
    SELECT id, full_name, email, phone, emirates_id, passport_number, nationality, address, created_at
    FROM buyers
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!buyers.length) {
    return NextResponse.json({error: 'Buyer not found'}, {status: 404});
  }

  return NextResponse.json({buyer: buyers[0]});
}

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const body = await request.json();
    const {fullName, email, phone, emiratesId, passportNumber, nationality, address} = body;

    const existing = await sql`SELECT * FROM buyers WHERE id = ${id}`;

    const result = await sql`
      UPDATE buyers
      SET
        full_name = COALESCE(${fullName || null}, full_name),
        email = COALESCE(${email || null}, email),
        phone = COALESCE(${phone || null}, phone),
        emirates_id = COALESCE(${emiratesId || null}, emirates_id),
        passport_number = COALESCE(${passportNumber || null}, passport_number),
        nationality = COALESCE(${nationality || null}, nationality),
        address = COALESCE(${address || null}, address)
      WHERE id = ${id}
      RETURNING *
    `;

    if (!result.length) {
      return NextResponse.json({error: 'Buyer not found'}, {status: 404});
    }

    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'update', resourceType: 'buyer', resourceId: result[0].id, before: existing[0] || null, after: result[0] });

    return NextResponse.json({buyer: result[0]});
  } catch (error) {
    console.error('Update buyer error:', error);
    return NextResponse.json({error: 'Failed to update buyer'}, {status: 500});
  }
}

export async function DELETE(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const existing = await sql`SELECT * FROM buyers WHERE id = ${id}`;

    const result = await sql`
      DELETE FROM buyers WHERE id = ${id} RETURNING id
    `;

    if (!result.length) {
      return NextResponse.json({error: 'Buyer not found'}, {status: 404});
    }

    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'delete', resourceType: 'buyer', resourceId: id, before: existing[0] || null, after: null });

    return NextResponse.json({success: true});
  } catch (error: any) {
    if (error.code === '23503') {
      return NextResponse.json({error: 'Cannot delete buyer because they have linked transactions'}, {status: 409});
    }
    console.error('Delete buyer error:', error);
    return NextResponse.json({error: 'Failed to delete buyer'}, {status: 500});
  }
}
