import { sql } from './db';

export async function setTenantContext(tenantId: string) {
  await sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
}

export async function queryWithTenant<T = unknown>(
  tenantId: string,
  queryTemplate: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  await setTenantContext(tenantId);
  return sql(queryTemplate, ...values) as Promise<T[]>;
}
