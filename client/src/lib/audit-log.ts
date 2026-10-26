export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'UPLOAD' | 'AUTH'

export interface AuditLogEntry {
  _id: string
  action: AuditAction
  entityType: string
  entityId: string
  summary: string
  actorName: string
  actorRole: string
  actorId?: string
  institution: string
  route: string
  method: string
  changedFields: string[]
  beforeData?: unknown
  afterData?: unknown
  metadata?: unknown
  createdAt: string
}

export interface AuditFilters {
  search: string
  action: string
  entityType: string
  actorId: string
  actorName: string
  entityId: string
  institution: string
  outcome: string
  dateFrom: string
  dateTo: string
}

export const emptyAuditFilters: AuditFilters = {
  search: '', action: '', entityType: '', actorId: '', actorName: '', entityId: '',
  institution: '', outcome: '', dateFrom: '', dateTo: '',
}

export const auditActionLabels: Record<string, string> = {
  CREATE: 'Create', UPDATE: 'Update', DELETE: 'Delete', STATUS_CHANGE: 'Status change',
  UPLOAD: 'Upload', AUTH: 'Authentication', UPDATES: 'Updates and status changes',
}

export function auditParams(filters: AuditFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) params.set(key, value.trim())
  }
  return params
}

const utcDate = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC',
})
export const auditTimestamp = (value: string) => `${utcDate.format(new Date(value))} UTC`

export interface AuditAnomalies {
  windowDays: number
  deleteSpikes: { institution: string; date: string; count: number; severity: string }[]
  failedAuthActors: { actorId?: string | null; actorName: string; institution: string; count: number }[]
  failedAuthInstitutions: { institution: string; count: number }[]
  massUpdates: { actorId?: string | null; actorName: string; institution: string; count: number; severity: string }[]
  riskyInstitutions: { institution: string; score: number; failedAuths: number; deleteSpikes: number }[]
}
