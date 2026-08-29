export const ADMIN_ROLES = ['Admin', 'RegionalAdmin', 'SuperAdmin'] as const

export type AdminRole = (typeof ADMIN_ROLES)[number]

export const isAdminRole = (role?: string | null): role is AdminRole =>
  Boolean(role && ADMIN_ROLES.some((adminRole) => adminRole === role))
