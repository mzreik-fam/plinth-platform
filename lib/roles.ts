export const ROLES = {
  PLATFORM_OWNER: 'platform_owner',
  SUPER_ADMIN: 'super_admin',
  PROJECT_MANAGER: 'project_manager',
  ADMIN: 'admin',
  INTERNAL_AGENT: 'internal_agent',
  AGENCY_ADMIN: 'agency_admin',
  AGENCY_AGENT: 'agency_agent',
  BUYER: 'buyer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<Role, Role[]> = {
  [ROLES.PLATFORM_OWNER]: [ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER, ROLES.ADMIN, ROLES.INTERNAL_AGENT],
  [ROLES.SUPER_ADMIN]: [ROLES.PROJECT_MANAGER, ROLES.ADMIN, ROLES.INTERNAL_AGENT],
  [ROLES.PROJECT_MANAGER]: [ROLES.ADMIN, ROLES.INTERNAL_AGENT],
  [ROLES.ADMIN]: [ROLES.INTERNAL_AGENT],
  [ROLES.INTERNAL_AGENT]: [],
  [ROLES.AGENCY_ADMIN]: [ROLES.AGENCY_AGENT],
  [ROLES.AGENCY_AGENT]: [],
  [ROLES.BUYER]: [],
};

export function canManageUsers(role: string): boolean {
  return ['super_admin', 'admin', 'platform_owner'].includes(role);
}

export function canCreateUnits(role: string): boolean {
  return ['super_admin', 'admin', 'project_manager'].includes(role);
}

export function canCreateTransactions(role: string): boolean {
  return ['super_admin', 'admin', 'internal_agent'].includes(role);
}

export function canRecordPayments(role: string): boolean {
  return ['super_admin', 'admin'].includes(role);
}

export function canDeleteUnits(role: string): boolean {
  return ['super_admin'].includes(role);
}
