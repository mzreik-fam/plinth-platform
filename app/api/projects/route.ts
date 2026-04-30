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

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const {searchParams} = new URL(request.url);
  const areaId = searchParams.get('areaId');

  let whereClause = '';
  const params: string[] = [];
  if (areaId) {
    whereClause = 'WHERE p.area_id = $1';
    params.push(areaId);
  }

  const projects = await sql.query(`
    SELECT p.id, p.name, p.status, p.created_at, a.id as area_id, a.name as area_name
    FROM projects p
    LEFT JOIN areas a ON a.id = p.area_id
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT 200
  `, params);

  return NextResponse.json({projects}, {
    headers: {'Cache-Control': 'private, max-age=300'},
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const body = await request.json();
    const {name, areaId} = body;

    if (!name) {
      return NextResponse.json({error: 'Project name is required'}, {status: 400});
    }

    const result = await sql`
      INSERT INTO projects (tenant_id, name, area_id)
      VALUES (${auth.tenantId}, ${name}, ${areaId || null})
      RETURNING *
    `;

    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'create', resourceType: 'project', resourceId: result[0].id, before: null, after: result[0] });

    return NextResponse.json({project: result[0]}, {status: 201});
  } catch {
    return NextResponse.json({error: 'Failed to create project'}, {status: 500});
  }
}
