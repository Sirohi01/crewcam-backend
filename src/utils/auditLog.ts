import { AuditLog } from '../models/AuditLog';

// Shared audit-log writer for platform-admin (Super Admin) actions that aren't scoped to a
// specific tenant, e.g. dropdown master-data CRUD. Defaults tenantId to the SUPER_ADMIN
// pseudo-tenant used elsewhere for platform-operator-owned records.
export async function writeAuditLog(params: {
  tenantId?: string;
  userId?: any;
  action: string;
  module: string;
  status?: 'SUCCESS' | 'FAILURE';
  details?: Record<string, any>;
}) {
  try {
    await AuditLog.create({
      tenantId: params.tenantId || 'SUPER_ADMIN',
      userId: params.userId,
      action: params.action,
      module: params.module,
      status: params.status || 'SUCCESS',
      details: params.details,
    } as any);
  } catch (err) {
    console.error('[audit] failed to write audit log:', err);
  }
}

// Field-by-field before/after diff for an UPDATE audit log entry — only the fields that
// actually changed are included, so the activity log can render "field: before -> after".
export function diffFields(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
  fields: string[]
): Record<string, { before: any; after: any }> {
  const changes: Record<string, { before: any; after: any }> = {};
  for (const key of fields) {
    const b = before?.[key] ?? null;
    const a = after?.[key] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[key] = { before: b, after: a };
    }
  }
  return changes;
}
