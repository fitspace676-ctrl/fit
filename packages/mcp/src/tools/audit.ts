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
      "List this gym's audit trail of privileged staff actions, newest first and filterable by date: action, who did it, who it affected and when. Use for 'who changed this' questions.",
    method: 'get',
    path: '/audit-logs',
    query: listAuditLogQuerySchema,
  },
]);
