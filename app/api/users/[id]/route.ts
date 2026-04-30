import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';
import {canManageUsers} from '@/lib/roles';

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

export async function GET(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canManageUsers(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const users = await sql`
    SELECT id, email, username, full_name, role, is_active, invite_token, invite_expires_at, created_at
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!users.length) {
    return NextResponse.json({error: 'User not found'}, {status: 404});
  }

  return NextResponse.json({user: users[0]});
}

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['super_admin', 'project_manager', 'admin', 'internal_agent', 'agency_admin', 'agency_agent', 'buyer']).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canManageUsers(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const body = await request.json();
    const data = updateUserSchema.parse(body);

    const existing = await sql`SELECT id, email, username, full_name, role, is_active, created_at FROM users WHERE id = ${id}`;

    const result = await sql`
      UPDATE users
      SET
        full_name = COALESCE(${data.fullName || null}, full_name),
        email = COALESCE(${data.email || null}, email),
        role = COALESCE(${data.role || null}, role),
        is_active = COALESCE(${data.isActive !== undefined ? data.isActive : null}, is_active),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, email, username, full_name, role, is_active, created_at
    `;

    if (!result.length) {
      return NextResponse.json({error: 'User not found'}, {status: 404});
    }

    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'update', resourceType: 'user', resourceId: result[0].id, before: existing[0] || null, after: result[0] });

    return NextResponse.json({user: result[0]});
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({error: error.issues[0]?.message || 'Invalid input'}, {status: 400});
    }
    console.error('Update user error:', error);
    return NextResponse.json({error: 'Failed to update user'}, {status: 500});
  }
}

export async function DELETE(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canManageUsers(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  const {id} = await params;

  try {
    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const existing = await sql`SELECT id, email, username, full_name, role, is_active, created_at FROM users WHERE id = ${id} AND tenant_id = ${auth.tenantId}`;

    const result = await sql`
      DELETE FROM users
      WHERE id = ${id}
      AND tenant_id = ${auth.tenantId}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json({error: 'User not found'}, {status: 404});
    }

    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'delete', resourceType: 'user', resourceId: id, before: existing[0] || null, after: null });

    return NextResponse.json({success: true});
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({error: 'Failed to delete user'}, {status: 500});
  }
}
