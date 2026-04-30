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

  const paymentPlans = await sql`
    SELECT id, name, description, milestones, is_default
    FROM payment_plans
    ORDER BY created_at DESC
    LIMIT 200
  `;

  return NextResponse.json({paymentPlans}, {
    headers: {'Cache-Control': 'private, max-age=300'},
  });
}
