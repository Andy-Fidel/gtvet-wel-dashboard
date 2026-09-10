export const ADMIN_ROLES = ['Admin', 'RegionalAdmin', 'SuperAdmin'] as const

export const MANAGEMENT_ROLES = ['SuperAdmin', 'RegionalAdmin', 'Admin', 'Manager'] as const

export const isHQRole = (role?: string | null) =>
  ['SuperAdmin', 'HQManager', 'HQStaff'].includes(role || '')

export const HQ_ROLE_PERMISSIONS = {
  SuperAdmin: ['hq:view', 'hq:approve', 'users:manage', 'system:manage'],
  HQManager: ['hq:view', 'hq:approve'],
  HQStaff: ['hq:view'],
} as const

export const hasHQPermission = (role: string | null | undefined, permission: string) =>
  Boolean(role && role in HQ_ROLE_PERMISSIONS && (HQ_ROLE_PERMISSIONS[role as keyof typeof HQ_ROLE_PERMISSIONS] as readonly string[]).includes(permission))

export const canApproveHQ = (role?: string | null) =>
  hasHQPermission(role, 'hq:approve')

export const getHQScopeLabel = (user?: {
  role?: string
  hqScopeType?: 'National' | 'Region' | 'Institution'
  region?: string
  institution?: string
} | null) => {
  if (!user || !['HQManager', 'HQStaff'].includes(user.role || '')) return null
  if (user.hqScopeType === 'Institution') return user.institution || 'Institution not assigned'
  if (user.hqScopeType === 'Region') return user.region ? `${user.region} Region` : 'Region not assigned'
  return 'National Operations'
}

export const canAccessHQPage = (role: string | undefined, path: string) => {
  if (role !== 'HQManager' && role !== 'HQStaff') return true
  return /^\/(system-overview|semester-reports|monitoring-visits|assessments|vacancies|hq-industry-partners|activity-log|support-center|learners|placements|attendance-logs|profile|notifications)(\/|$)/.test(path) || path === '/'
}

export type AdminRole = (typeof ADMIN_ROLES)[number]
export type ManagementRole = (typeof MANAGEMENT_ROLES)[number]

export const isAdminRole = (role?: string | null): role is AdminRole =>
  Boolean(role && ADMIN_ROLES.some((adminRole) => adminRole === role))

export const isManagementRole = (role?: string | null): role is ManagementRole =>
  Boolean(role && MANAGEMENT_ROLES.some((managementRole) => managementRole === role))
