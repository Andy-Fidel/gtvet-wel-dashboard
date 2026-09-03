export const ADMIN_ROLES = ['Admin', 'RegionalAdmin', 'SuperAdmin'] as const

export const MANAGEMENT_ROLES = ['SuperAdmin', 'RegionalAdmin', 'Admin', 'Manager'] as const

export type AdminRole = (typeof ADMIN_ROLES)[number]
export type ManagementRole = (typeof MANAGEMENT_ROLES)[number]

export const isAdminRole = (role?: string | null): role is AdminRole =>
  Boolean(role && ADMIN_ROLES.some((adminRole) => adminRole === role))

export const isManagementRole = (role?: string | null): role is ManagementRole =>
  Boolean(role && MANAGEMENT_ROLES.some((managementRole) => managementRole === role))
