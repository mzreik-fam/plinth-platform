import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';
import {canCreateUnits, canDeleteUnits} from '@/lib/roles';
import {z} from 'zod';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

const updateUnitSchema = z.object({
  unitNumber: z.string().min(1).optional(),
  unitType: z.enum(['villa', 'plot', 'apartment']).optional(),
  bedrooms: z.number().int().optional(),
  bathrooms: z.number().int().optional(),
  areaSqft: z.number().optional(),
  price: z.number().positive().optional(),
  status: z.enum(['draft', 'available']).optional(),
});

export async function GET(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const units = await sql`
    SELECT u.*, p.name as project_name
    FROM units u
    LEFT JOIN projects p ON p.id = u.project_id
    WHERE u.id = ${id}
    LIMIT 1
  `;

  if (units.length === 0) {
    return NextResponse.json({error: 'Unit not found'}, {status: 404});
  }

  return NextResponse.json({unit: units[0]});
}

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canCreateUnits(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  try {
    const {id} = await params;
    const body = await request.json();
    const data = updateUnitSchema.parse(body);

    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const existing = await sql`SELECT * FROM units WHERE id = ${id}`;

    const result = await sql`
      UPDATE units
      SET
        unit_number = COALESCE(${data.unitNumber || null}, unit_number),
        unit_type = COALESCE(${data.unitType || null}, unit_type),
        bedrooms = COALESCE(${data.bedrooms || null}, bedrooms),
        bathrooms = COALESCE(${data.bathrooms || null}, bathrooms),
        area_sqft = COALESCE(${data.areaSqft || null}, area_sqft),
        price = COALESCE(${data.price || null}, price),
        status = COALESCE(${data.status || null}, status),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json({error: 'Unit not found'}, {status: 404});
    }

    const auditAction = data.status ? 'status_change' : 'update';
    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: auditAction, resourceType: 'unit', resourceId: result[0].id, before: existing[0] || null, after: result[0] });

    return NextResponse.json({unit: result[0]});
  } catch (error) {
    console.error('Update unit error:', error);
    return NextResponse.json({error: 'Failed to update unit'}, {status: 500});
  }
}

export async function DELETE(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canDeleteUnits(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  const {id} = await params;
  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  try {
    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const existing = await sql`SELECT * FROM units WHERE id = ${id}`;

    const result = await sql`
      DELETE FROM units WHERE id = ${id} RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json({error: 'Unit not found'}, {status: 404});
    }

    await logAudit({ tenantId: auth.tenantId, userId: auth.userId, action: 'delete', resourceType: 'unit', resourceId: id, before: existing[0] || null, after: null });

    return NextResponse.json({success: true});
  } catch (error: any) {
    if (error.code === '23503') {
      return NextResponse.json({error: 'Cannot delete unit because it has linked transactions or records'}, {status: 409});
    }
    console.error('Delete unit error:', error);
    return NextResponse.json({error: 'Failed to delete unit'}, {status: 500});
  }
}
