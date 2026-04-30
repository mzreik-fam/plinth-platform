import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {notifyUnitApprovalRequested} from '@/lib/email';

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
  const status = searchParams.get('status');

  const approvals = await sql`
    SELECT
      ua.*,
      u.unit_number,
      p.name as project_name,
      req.full_name as requested_by_name,
      rev.full_name as reviewed_by_name
    FROM unit_approvals ua
    JOIN units u ON ua.unit_id = u.id
    JOIN projects p ON u.project_id = p.id
    LEFT JOIN users req ON ua.requested_by = req.id
    LEFT JOIN users rev ON ua.reviewed_by = rev.id
    ${status ? sql`WHERE ua.status = ${status}` : sql``}
    ORDER BY ua.requested_at DESC
    LIMIT 200
  `;

  return NextResponse.json({approvals}, {
    headers: {'Cache-Control': 'private, max-age=30'},
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const body = await request.json();
  const {unit_id} = body;

  if (!unit_id) {
    return NextResponse.json({error: 'Unit ID required'}, {status: 400});
  }

  const result = await sql`
    INSERT INTO unit_approvals (tenant_id, unit_id, requested_by, status)
    VALUES (${auth.tenantId}, ${unit_id}, ${auth.userId}, 'pending')
    ON CONFLICT (tenant_id, unit_id) DO UPDATE SET
      status = 'pending',
      requested_by = EXCLUDED.requested_by,
      reviewed_by = NULL,
      reviewed_at = NULL,
      requested_at = NOW()
    RETURNING *
  `;

  // Get unit details and find PMs/Super Admins to notify
  const unitData = await sql`
    SELECT u.unit_number, p.name as project_name, req.full_name as requested_by_name
    FROM units u
    JOIN projects p ON u.project_id = p.id
    LEFT JOIN users req ON req.id = ${auth.userId}
    WHERE u.id = ${unit_id}
  `;

  const reviewers = await sql`
    SELECT email, full_name FROM users
    WHERE tenant_id = ${auth.tenantId}
    AND role IN ('super_admin', 'project_manager', 'platform_owner')
    AND is_active = true
  `;

  if (unitData.length > 0 && reviewers.length > 0) {
    const unit = unitData[0];
    for (const reviewer of reviewers) {
      await notifyUnitApprovalRequested({
        to: reviewer.email,
        unitNumber: unit.unit_number,
        projectName: unit.project_name,
        requestedBy: unit.requested_by_name || 'Admin',
      });
    }
  }

  return NextResponse.json({approval: result[0]});
}
