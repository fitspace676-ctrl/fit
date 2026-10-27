import { listAuditLogQuerySchema } from '@fit/types';
import { listOf, slimAuditLog } from './projections';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/audit/audit.controller.ts. */
export const auditTools = defineTools('insights', [
  {
    name: 'list_audit_logs',
    project: listOf(slimAuditLog),
    title: 'List audit logs',
    titleKa: 'აუდიტის ჟურნალი',
    description:
      'List the audit trail of privileged staff actions, newest first, filterable by date: action, actor, target, time. Use for who changed this; member check-ins, bookings and payments are list_activity.',
    method: 'get',
    path: '/audit-logs',
    query: listAuditLogQuerySchema,
  },
]);
