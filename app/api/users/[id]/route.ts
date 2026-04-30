import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {canManageUsers} from '@/lib/roles';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function DELETE(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canManageUsers(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  const {id} = await params;

  try {
    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const result = await sql`
      DELETE FROM users
      WHERE id = ${id}
      AND tenant_id = ${auth.tenantId}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json({error: 'User not found'}, {status: 404});
    }

    return NextResponse.json({success: true});
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({error: 'Failed to delete user'}, {status: 500});
  }
}
