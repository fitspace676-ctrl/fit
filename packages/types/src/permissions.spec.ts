import { describe, expect, it } from 'vitest';
import { Permission, roleHasPermission } from './permissions';
import { defaultRolePermissions, EDITABLE_PERMISSIONS } from './role-permissions';

describe('AI assistant access', () => {
  it('belongs to owners and managers by default, not the front desk or coaches', () => {
    expect(roleHasPermission('OWNER', Permission.AiAgentUse)).toBe(true);
    expect(roleHasPermission('MANAGER', Permission.AiAgentUse)).toBe(true);
    expect(roleHasPermission('RECEPTIONIST', Permission.AiAgentUse)).toBe(false);
    expect(roleHasPermission('TRAINER', Permission.AiAgentUse)).toBe(false);
    expect(roleHasPermission('MEMBER', Permission.AiAgentUse)).toBe(false);
  });

  it('is a grant a gym can give or take away in the roles editor', () => {
    expect(EDITABLE_PERMISSIONS).toContain(Permission.AiAgentUse);
    expect(defaultRolePermissions('TRAINER').grants).not.toContain(Permission.AiAgentUse);
    expect(defaultRolePermissions('MANAGER').grants).toContain(Permission.AiAgentUse);
  });
});
