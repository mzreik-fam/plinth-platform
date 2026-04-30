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

export async function DELETE(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    const existing = await sql`SELECT * FROM areas WHERE id = ${id}`;

    const result = await sql`
      DELETE FROM areas WHERE id = ${id} RETURNING id
    `;

    if (!result.length) {
      return NextResponse.json({error: 'Area not found'}, {status: 404});
    }

    await logAudit({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: 'delete',
      resourceType: 'area',
      resourceId: id,
      before: existing[0] || null,
      after: null,
    });

    return NextResponse.json({success: true});
  } catch (error: any) {
    if (error.code === '23503') {
      return NextResponse.json({error: 'Cannot delete area because it is referenced by projects'}, {status: 409});
    }
    console.error('Delete area error:', error);
    return NextResponse.json({error: 'Failed to delete area'}, {status: 500});
  }
}
