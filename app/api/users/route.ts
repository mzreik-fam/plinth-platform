import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {canManageUsers} from '@/lib/roles';
import {hashPassword} from '@/lib/auth';
import {notifyUserInvitation} from '@/lib/email';
import {z} from 'zod';
import crypto from 'crypto';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

const createUserSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  fullName: z.string().min(1),
  role: z.enum(['super_admin', 'project_manager', 'admin', 'internal_agent', 'agency_admin', 'agency_agent', 'buyer']),
});

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  const {searchParams} = new URL(request.url);
  const role = searchParams.get('role');

  // Allow any authenticated user to query by role (needed for workflows like sales)
  // Restrict full user list to managers only
  if (!role && !canManageUsers(auth.role)) {
    return NextResponse.json({error: 'Forbidden'}, {status: 403});
  }

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  let query;
  if (role) {
    query = sql`
      SELECT id, email, username, full_name, role, is_active, invite_token, invite_expires_at, created_at
      FROM users
      WHERE role = ${role}
      ORDER BY created_at DESC
    `;
  } else {
    query = sql`
      SELECT id, email, username, full_name, role, is_active, invite_token, invite_expires_at, created_at
      FROM users
      ORDER BY created_at DESC
    `;
  }

  const users = await query;
  return NextResponse.json({users}, {
    headers: {'Cache-Control': 'private, max-age=60'},
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canManageUsers(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  try {
    const body = await request.json();
    const data = createUserSchema.parse(body);

    // Generate a random invite token
    const inviteToken = crypto.randomUUID();
    // Generate a temporary random password hash (user will set their own)
    const tempPasswordHash = await hashPassword(crypto.randomBytes(32).toString('hex'));

    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const result = await sql`
      INSERT INTO users (tenant_id, email, username, password_hash, full_name, role, is_active, invite_token, invite_expires_at)
      VALUES (
        ${auth.tenantId},
        ${data.email},
        ${data.username},
        ${tempPasswordHash},
        ${data.fullName},
        ${data.role},
        false,
        ${inviteToken},
        NOW() + INTERVAL '7 days'
      )
      RETURNING id, email, username, full_name, role, is_active, created_at
    `;

    // Send invitation email
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL?.trim()}/en/invite/${inviteToken}`;
    await notifyUserInvitation({
      to: data.email,
      fullName: data.fullName,
      inviteUrl,
    });

    return NextResponse.json({user: result[0]}, {status: 201});
  } catch (error: any) {
    if (error.code === '23505') {
      return NextResponse.json({error: 'Username or email already exists'}, {status: 409});
    }
    console.error('Create user error:', error);
    return NextResponse.json({error: 'Failed to create user'}, {status: 500});
  }
}
