import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {canCreateUnits} from '@/lib/roles';
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

const createUnitSchema = z.object({
  projectId: z.string().uuid(),
  unitNumber: z.string().min(1),
  unitType: z.enum(['villa', 'plot', 'apartment']),
  bedrooms: z.number().int().optional(),
  bathrooms: z.number().int().optional(),
  areaSqft: z.number().optional(),
  price: z.number().positive(),
  status: z.enum(['draft', 'available']).default('draft'),
});

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const {searchParams} = new URL(request.url);
  const status = searchParams.get('status');

  let units;
  if (status) {
    units = await sql`
      SELECT u.*, p.name as project_name
      FROM units u
      LEFT JOIN projects p ON p.id = u.project_id
      WHERE u.status = ${status}
      ORDER BY u.created_at DESC
    `;
  } else {
    units = await sql`
      SELECT u.*, p.name as project_name
      FROM units u
      LEFT JOIN projects p ON p.id = u.project_id
      ORDER BY u.created_at DESC
    `;
  }

  return NextResponse.json({units});
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!canCreateUnits(auth.role)) return NextResponse.json({error: 'Forbidden'}, {status: 403});

  try {
    const body = await request.json();
    const data = createUnitSchema.parse(body);

    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const result = await sql`
      INSERT INTO units (tenant_id, project_id, unit_number, unit_type, bedrooms, bathrooms, area_sqft, price, status, created_by)
      VALUES (${auth.tenantId}, ${data.projectId}, ${data.unitNumber}, ${data.unitType}, ${data.bedrooms || null}, ${data.bathrooms || null}, ${data.areaSqft || null}, ${data.price}, ${data.status}, ${auth.userId})
      RETURNING *
    `;

    // Auto-create approval request if status is draft
    if (data.status === 'draft') {
      await sql`
        INSERT INTO unit_approvals (tenant_id, unit_id, requested_by, status)
        VALUES (${auth.tenantId}, ${result[0].id}, ${auth.userId}, 'pending')
        ON CONFLICT (tenant_id, unit_id) DO NOTHING
      `;
    }

    return NextResponse.json({unit: result[0]}, {status: 201});
  } catch (error) {
    console.error('Create unit error:', error);
    return NextResponse.json({error: 'Failed to create unit'}, {status: 500});
  }
}
