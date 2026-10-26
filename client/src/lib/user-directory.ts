export type User = {
    _id: string
    name: string
    email: string
    role: 'SuperAdmin' | 'HQManager' | 'HQStaff' | 'RegionalAdmin' | 'Admin' | 'Manager' | 'Staff' | 'IndustryPartner' | 'Guardian'
    status: 'Active' | 'Inactive'
    lifecycleStatus?: {
      code: 'Invited' | 'ResetPending' | 'PasswordChangeRequired' | 'Active' | 'Inactive'
      label: string
    }
    passwordChangeRequired?: boolean
    phone?: string
    institution?: string
    region?: string
    hqScopeType?: 'National' | 'Region' | 'Institution'
    effectiveRegion?: string
    partnerId?: { _id: string, name: string }
    partnerPortalRole?: 'Coordinator' | 'Supervisor'
    linkedLearners?: Array<{ _id: string; name: string; trackingId?: string; institution?: string }>
    invitationSentAt?: string
    invitationDeliveryStatus?: 'sent' | 'failed'
    inviteAcceptedAt?: string
    lastLoginAt?: string
    resetPasswordExpires?: string
    workloadSummary?: {
      learnersOwned: number
      activePlacementsOwned: number
    }
    auditSummary?: {
      createdBy?: {
        actorName: string
        actorRole: string
        createdAt: string
      } | null
      lastRoleChange?: {
        actorName: string
        actorRole: string
        createdAt: string
      } | null
      lastLoginAt?: string | null
      failedLoginCount: number
      recentSensitiveActions: Array<{
        _id: string
        action: string
        summary: string
        actorName: string
        actorRole: string
        changedFields: string[]
        createdAt: string
      }>
    }
    createdAt: string
}


export const userRoleLabel = (role: string) => ({ SuperAdmin: 'Super Admin', HQManager: 'HQ Manager', HQStaff: 'HQ Staff', RegionalAdmin: 'Regional Admin', IndustryPartner: 'Industry Partner' }[role] || role)

export function userScope(user: User) {
  if (user.role === 'SuperAdmin') return 'Platform-wide'
  if (user.role === 'HQManager' || user.role === 'HQStaff') {
    if (user.hqScopeType === 'Region') return `Region: ${user.region || 'Not recorded'}`
    if (user.hqScopeType !== 'Institution') return 'National'
  }
  if (user.role === 'RegionalAdmin') return `Region: ${user.region || 'Not recorded'}`
  if (user.role === 'IndustryPartner') return `Partner: ${user.partnerId?.name || 'Not recorded'}`
  if (user.role === 'Guardian') return `${user.linkedLearners?.length ?? 0} linked learners`
  return `Institution: ${user.institution || 'Not recorded'}`
}

export function userSetupLabel(user: User) {
  const code = user.lifecycleStatus?.code
  if (code === 'Invited') return 'Invitation pending'
  if (code === 'ResetPending') return 'Password reset pending'
  if (code === 'PasswordChangeRequired' || user.passwordChangeRequired === true) return 'Password setup required'
  if (code === 'Active' || user.passwordChangeRequired === false) return 'Password setup complete'
  return 'Setup state not recorded'
}
