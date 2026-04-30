import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyPassword, signToken} from '@/lib/auth';
import {setSessionCookie} from '@/lib/session';
import {z} from 'zod';

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {usernameOrEmail, password} = loginSchema.parse(body);

    // Find user by username or email (bypass RLS for auth)
    const users = await sql`
      SELECT u.id, u.tenant_id, u.email, u.username, u.password_hash, u.full_name, u.role, u.is_active, u.invite_token, t.slug as tenant_slug
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE (u.username = ${usernameOrEmail} OR u.email = ${usernameOrEmail})
      LIMIT 1
    `;

    if (users.length === 0) {
      return NextResponse.json({error: 'Invalid credentials'}, {status: 401});
    }

    const user = users[0];

    if (user.invite_token) {
      return NextResponse.json({error: 'Please accept your invitation before logging in'}, {status: 401});
    }

    if (!user.is_active) {
      return NextResponse.json({error: 'Account inactive'}, {status: 401});
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({error: 'Invalid credentials'}, {status: 401});
    }

    const token = await signToken({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
    });

    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        tenantId: user.tenant_id,
        tenantSlug: user.tenant_slug,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({error: 'Login failed'}, {status: 500});
  }
}
