import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';

import {logAudit} from '@/lib/audit';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const areas = await sql`
    SELECT id, name, created_at
    FROM areas
    ORDER BY name ASC
    LIMIT 200
  `;

  return NextResponse.json({areas}, {
    headers: {'Cache-Control': 'private, max-age=300'},
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const body = await request.json();
    const {name} = body;

    if (!name || !name.trim()) {
      return NextResponse.json({error: 'Area name is required'}, {status: 400});
    }

    const result = await sql`
      INSERT INTO areas (tenant_id, name)
      VALUES (${auth.tenantId}, ${name.trim()})
      RETURNING *
    `;

    await logAudit({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: 'create',
      resourceType: 'area',
      resourceId: result[0].id,
      before: null,
      after: result[0],
    });

    return NextResponse.json({area: result[0]}, {status: 201});
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as {code: string}).code === '23505') {
      return NextResponse.json({error: 'An area with this name already exists'}, {status: 409});
    }
    console.error('Create area error:', error);
    return NextResponse.json({error: 'Failed to create area'}, {status: 500});
  }
}
