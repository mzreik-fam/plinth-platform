import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';
import {requireSuperAdmin} from '@/lib/permissions';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function DELETE(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  // Super Admin only: payment plan deletion
  try {
    requireSuperAdmin(auth);
  } catch (e) {
    return NextResponse.json({error: 'Forbidden: Only Super Admin can delete payment plans'}, {status: 403});
  }

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const existing = await sql`SELECT * FROM payment_plans WHERE id = ${id}`;

    const result = await sql`
      DELETE FROM payment_plans WHERE id = ${id} RETURNING id
    `;

    if (!result.length) {
      return NextResponse.json({error: 'Payment plan not found'}, {status: 404});
    }

    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'delete', resourceType: 'payment_plan', resourceId: id, before: existing[0] || null, after: null });

    return NextResponse.json({success: true});
  } catch (error: unknown) {
    if ((error as {code?: string}).code === '23503') {
      return NextResponse.json({error: 'Cannot delete payment plan because it is in use'}, {status: 409});
    }
    console.error('Delete payment plan error:', error);
    return NextResponse.json({error: 'Failed to delete payment plan'}, {status: 500});
  }
}
