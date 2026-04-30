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

  const {searchParams} = new URL(request.url);
  const unreadOnly = searchParams.get('unread') === 'true';

  const notifications = await sql`
    SELECT * FROM notifications
    WHERE user_id = ${auth.userId}
    ${unreadOnly ? sql`AND is_read = false` : sql``}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({notifications});
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const {id, all} = await request.json();

  if (all) {
    await sql`
      UPDATE notifications
      SET is_read = true
      WHERE user_id = ${auth.userId} AND is_read = false
    `;
  } else if (id) {
    await sql`
      UPDATE notifications
      SET is_read = true
      WHERE id = ${id} AND user_id = ${auth.userId}
    `;
  }

  return NextResponse.json({success: true});
}
