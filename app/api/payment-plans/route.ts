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

  try {
    const paymentPlans = await sql`
      SELECT * FROM payment_plans
      ORDER BY created_at DESC
    `;
    return NextResponse.json({paymentPlans});
  } catch (error) {
    console.error('Get payment plans error:', error);
    return NextResponse.json({error: 'Failed to fetch payment plans'}, {status: 500});
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const body = await request.json();
    const {name, description, milestones} = body;

    if (!name || !milestones || !Array.isArray(milestones)) {
      return NextResponse.json({error: 'Name and milestones array required'}, {status: 400});
    }

    const result = await sql`
      INSERT INTO payment_plans (tenant_id, name, description, milestones, is_default)
      VALUES (${auth.tenantId}, ${name}, ${description || null}, ${JSON.stringify(milestones)}, false)
      RETURNING *
    `;

    return NextResponse.json({paymentPlan: result[0]}, {status: 201});
  } catch (error) {
    console.error('Create payment plan error:', error);
    return NextResponse.json({error: 'Failed to create payment plan'}, {status: 500});
  }
}
