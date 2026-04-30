import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import bcrypt from 'bcryptjs';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  try {
    const {currentPassword, newPassword} = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({error: 'Current and new password required'}, {status: 400});
    }

    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const users = await sql`
      SELECT password_hash FROM users WHERE id = ${auth.userId} LIMIT 1
    `;

    if (!users.length) {
      return NextResponse.json({error: 'User not found'}, {status: 404});
    }

    const valid = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!valid) {
      return NextResponse.json({error: 'Current password is incorrect'}, {status: 400});
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await sql`
      UPDATE users SET password_hash = ${newHash}, updated_at = NOW() WHERE id = ${auth.userId}
    `;

    return NextResponse.json({success: true});
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({error: 'Failed to change password'}, {status: 500});
  }
}
