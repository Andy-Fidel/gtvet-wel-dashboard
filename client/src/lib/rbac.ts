export const ADMIN_ROLES = ['Admin', 'RegionalAdmin', 'SuperAdmin'] as const

export const MANAGEMENT_ROLES = ['SuperAdmin', 'RegionalAdmin', 'Admin', 'Manager'] as const

export const isHQRole = (role?: string | null) =>
  ['SuperAdmin', 'HQManager', 'HQStaff'].includes(role || '')

export const canApproveHQ = (role?: string | null) =>
  role === 'SuperAdmin' || role === 'HQManager'

export const canAccessHQPage = (role: string | undefined, path: string) => {
  if (role !== 'HQManager' && role !== 'HQStaff') return true
  return /^\/(system-overview|semester-reports|monitoring-visits|assessments|vacancies|hq-industry-partners|activity-log|learners|placements|attendance-logs|profile|notifications)(\/|$)/.test(path) || path === '/'
}

export type AdminRole = (typeof ADMIN_ROLES)[number]
export type ManagementRole = (typeof MANAGEMENT_ROLES)[number]

export const isAdminRole = (role?: string | null): role is AdminRole =>
  Boolean(role && ADMIN_ROLES.some((adminRole) => adminRole === role))

export const isManagementRole = (role?: string | null): role is ManagementRole =>
  Boolean(role && MANAGEMENT_ROLES.some((managementRole) => managementRole === role))
