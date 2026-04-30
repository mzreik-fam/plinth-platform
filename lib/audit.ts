import { sql } from '@/lib/db';

export type AuditAction = 'create' | 'update' | 'delete' | 'status_change';

export async function logAudit({
  tenantId,
  userId,
  action,
  resourceType,
  resourceId,
  before,
  after,
}: {
  tenantId: string;
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  try {
    await sql`
      INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, details)
      VALUES (
        ${tenantId},
        ${userId},
        ${action},
        ${resourceType},
        ${resourceId || null},
        ${JSON.stringify({ before: before ?? null, after: after ?? null })}
      )
    `;
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}
