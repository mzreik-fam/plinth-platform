import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {hashPassword} from '@/lib/auth';

export async function GET(request: NextRequest, {params}: {params: Promise<{token: string}>}) {
  const {token} = await params;

  const user = await sql`
    SELECT id, email, username, full_name, role, tenant_id
    FROM users
    WHERE invite_token = ${token}
    AND invite_expires_at > NOW()
    AND is_active = true
  `;

  if (!user.length) {
    return NextResponse.json({error: 'Invalid or expired invitation'}, {status: 400});
  }

  return NextResponse.json({user: user[0]});
}

export async function POST(request: NextRequest, {params}: {params: Promise<{token: string}>}) {
  const {token} = await params;
  const body = await request.json();
  const {password} = body;

  if (!password || password.length < 6) {
    return NextResponse.json({error: 'Password must be at least 6 characters'}, {status: 400});
  }

  const user = await sql`
    SELECT id
    FROM users
    WHERE invite_token = ${token}
    AND invite_expires_at > NOW()
    AND is_active = true
  `;

  if (!user.length) {
    return NextResponse.json({error: 'Invalid or expired invitation'}, {status: 400});
  }

  const passwordHash = await hashPassword(password);

  await sql`
    UPDATE users
    SET password_hash = ${passwordHash},
        invite_token = NULL,
        invite_expires_at = NULL,
        updated_at = NOW()
    WHERE id = ${user[0].id}
  `;

  return NextResponse.json({success: true});
}
