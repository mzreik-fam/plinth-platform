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

  const projects = await sql`
    SELECT id, name, location, area, status
    FROM projects
    ORDER BY created_at DESC
  `;

  return NextResponse.json({projects});
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const body = await request.json();
    const {name, location, area} = body;

    if (!name) {
      return NextResponse.json({error: 'Project name is required'}, {status: 400});
    }

    const result = await sql`
      INSERT INTO projects (tenant_id, name, location, area)
      VALUES (${auth.tenantId}, ${name}, ${location || null}, ${area || null})
      RETURNING *
    `;

    return NextResponse.json({project: result[0]}, {status: 201});
  } catch {
    return NextResponse.json({error: 'Failed to create project'}, {status: 500});
  }
}
