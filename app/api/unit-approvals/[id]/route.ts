import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';
import {notifyUnitApproved} from '@/lib/email';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;
  const {id} = await params;

  const body = await request.json();
  const {status, notes} = body;

  if (!status || !['approved','rejected'].includes(status)) {
    return NextResponse.json({error: 'Status must be approved or rejected'}, {status: 400});
  }

  const existing = await sql`SELECT * FROM unit_approvals WHERE id = ${id}`;

  const result = await sql`
    UPDATE unit_approvals
    SET
      status = ${status},
      reviewed_by = ${auth.userId},
      notes = COALESCE(${notes || null}, notes),
      reviewed_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  if (!result.length) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  const auditAction = status === 'approved' ? 'status_change' : 'update';
  await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: auditAction, resourceType: 'unit_approval', resourceId: result[0].id, before: existing[0] || null, after: result[0] });

  // Update unit status based on approval
  const unitId = result[0].unit_id;
  if (status === 'approved') {
    await sql`
      UPDATE units
      SET status = 'available', reviewed_by = ${auth.userId}, approved_at = NOW(), updated_at = NOW()
      WHERE id = ${unitId}
    `;

    // Notify the requester that unit was approved
    const approval = result[0];
    const requester = await sql`
      SELECT email FROM users WHERE id = ${approval.requested_by}
    `;
    const unitData = await sql`
      SELECT u.unit_number, p.name as project_name
      FROM units u
      JOIN projects p ON u.project_id = p.id
      WHERE u.id = ${unitId}
    `;

    if (requester.length > 0 && unitData.length > 0) {
      await notifyUnitApproved({
        to: requester[0].email,
        unitNumber: unitData[0].unit_number,
        projectName: unitData[0].project_name,
      });
    }
  }

  return NextResponse.json({approval: result[0]});
}
