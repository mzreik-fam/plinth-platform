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

export async function GET(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const projects = await sql`
    SELECT p.id, p.name, p.status, p.created_at, a.id as area_id, a.name as area_name
    FROM projects p
    LEFT JOIN areas a ON a.id = p.area_id
    WHERE p.id = ${id}
    LIMIT 1
  `;

  if (!projects.length) {
    return NextResponse.json({error: 'Project not found'}, {status: 404});
  }

  return NextResponse.json({project: projects[0]});
}

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const body = await request.json();
    const {name, areaId, status} = body;

    const existing = await sql`SELECT * FROM projects WHERE id = ${id}`;

    const result = await sql`
      UPDATE projects
      SET
        name = COALESCE(${name || null}, name),
        area_id = ${areaId !== undefined ? (areaId || null) : undefined},
        status = COALESCE(${status || null}, status),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (!result.length) {
      return NextResponse.json({error: 'Project not found'}, {status: 404});
    }

    const auditAction = status ? 'status_change' : 'update';
    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: auditAction, resourceType: 'project', resourceId: result[0].id, before: existing[0] || null, after: result[0] });

    return NextResponse.json({project: result[0]});
  } catch (error) {
    console.error('Update project error:', error);
    return NextResponse.json({error: 'Failed to update project'}, {status: 500});
  }
}

export async function DELETE(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const existing = await sql`SELECT * FROM projects WHERE id = ${id}`;

    const result = await sql`
      DELETE FROM projects WHERE id = ${id} RETURNING id
    `;

    if (!result.length) {
      return NextResponse.json({error: 'Project not found'}, {status: 404});
    }

    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'delete', resourceType: 'project', resourceId: id, before: existing[0] || null, after: null });

    return NextResponse.json({success: true});
  } catch (error: unknown) {
    if ((error as {code?: string}).code === '23503') {
      return NextResponse.json({error: 'Cannot delete project because it has linked units'}, {status: 409});
    }
    console.error('Delete project error:', error);
    return NextResponse.json({error: 'Failed to delete project'}, {status: 500});
  }
}
