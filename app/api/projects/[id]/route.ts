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

export async function GET(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const projects = await sql`
    SELECT id, name, location, area, status, created_at
    FROM projects
    WHERE id = ${id}
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
    const {name, location, area, status} = body;

    const result = await sql`
      UPDATE projects
      SET
        name = COALESCE(${name || null}, name),
        location = COALESCE(${location || null}, location),
        area = COALESCE(${area || null}, area),
        status = COALESCE(${status || null}, status),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (!result.length) {
      return NextResponse.json({error: 'Project not found'}, {status: 404});
    }

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
    const result = await sql`
      DELETE FROM projects WHERE id = ${id} RETURNING id
    `;

    if (!result.length) {
      return NextResponse.json({error: 'Project not found'}, {status: 404});
    }

    return NextResponse.json({success: true});
  } catch (error: any) {
    if (error.code === '23503') {
      return NextResponse.json({error: 'Cannot delete project because it has linked units'}, {status: 409});
    }
    console.error('Delete project error:', error);
    return NextResponse.json({error: 'Failed to delete project'}, {status: 500});
  }
}
