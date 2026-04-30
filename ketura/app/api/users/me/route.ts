import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';

export async function GET(request: NextRequest) {
  const token = await getSessionCookie();
  if (!token) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  try {
    const auth = await verifyToken(token);
    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const users = await sql`
      SELECT id, email, username, full_name, role, is_active, tenant_id
      FROM users
      WHERE id = ${auth.userId}
      LIMIT 1
    `;

    if (users.length === 0) {
      return NextResponse.json({error: 'User not found'}, {status: 404});
    }

    return NextResponse.json({user: users[0]});
  } catch {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
}
