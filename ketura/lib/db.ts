import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

export const sql = neon(process.env.DATABASE_URL);

export async function withTenant(tenantId: string, queryFn: (db: typeof sql) => Promise<any>) {
  await sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
  return queryFn(sql);
}
