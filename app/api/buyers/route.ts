import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';

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

const createBuyerSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(1, 'Phone is required'),
  emiratesId: z.string().optional(),
  passportNumber: z.string().optional(),
  nationality: z.string().optional(),
  address: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

  const {searchParams} = new URL(request.url);
  const search = searchParams.get('search');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const offset = parseInt(searchParams.get('offset') || '0');

  let whereClauses: string[] = [];
  let params: any[] = [];
  let paramIndex = 1;

  if (search) {
    whereClauses.push(`(full_name ILIKE $${paramIndex++} OR phone ILIKE $${paramIndex++} OR emirates_id ILIKE $${paramIndex++})`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const buyers = await sql.query(`
    SELECT id, full_name, email, phone, emirates_id, passport_number, nationality, address, created_at
    FROM buyers
    ${where}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `, [...params, limit, offset]);

  const countResult = await sql.query(`
    SELECT COUNT(*) as total
    FROM buyers
    ${where}
  `, params);

  return NextResponse.json({buyers, total: parseInt(countResult[0]?.total || '0'), limit, offset});
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  try {
    const body = await request.json();
    const data = createBuyerSchema.parse(body);

    await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;

    const result = await sql`
      INSERT INTO buyers (tenant_id, full_name, email, phone, emirates_id, passport_number, nationality, address)
      VALUES (${auth.tenantId}, ${data.fullName}, ${data.email || null}, ${data.phone}, ${data.emiratesId || null}, ${data.passportNumber || null}, ${data.nationality || null}, ${data.address || null})
      RETURNING *
    `;

    return NextResponse.json({buyer: result[0]}, {status: 201});
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({error: error.issues[0]?.message || 'Invalid input'}, {status: 400});
    }
    console.error('Create buyer error:', error);
    return NextResponse.json({error: 'Failed to create buyer'}, {status: 500});
  }
}
