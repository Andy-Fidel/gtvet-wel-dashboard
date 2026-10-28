import type { HQPartnerRecord } from '@/components/HQPartnerDetailsDialog'

export const approvalLabels: Record<string, string> = { PendingHQApproval: 'Pending HQ', Approved: 'Approved', Rejected: 'Rejected' }
export const partnerTypeLabels: Record<string, string> = { RegisteredCompany: 'Registered company', MasterCraftPerson: 'Master Craft Person', Government: 'Government', NGO: 'NGO', Other: 'Other' }
export const attentionLabels: Record<string, string> = { missingPrograms: 'Programme eligibility missing', missingDistrict: 'District missing', missingEmail: 'Email missing', missingMou: 'MoU document missing' }
export const portalLabels: Record<string, string> = { NotCreated: 'No coordinator account', SetupPending: 'Coordinator setup pending', Active: 'Coordinator access enabled', Suspended: 'Coordinator access suspended', DeliveryFailed: 'Coordinator setup email failed', EmailInUse: 'Contact email already has an account' }
export const sortLabels: Record<string, string> = { newest: 'Newest added', oldest: 'Oldest added', 'name-asc': 'Name A–Z', 'name-desc': 'Name Z–A' }
export const registryFilterLabels: Record<string, string> = { q: 'Search', approvalStatus: 'Approval', region: 'Region', sector: 'Sector', partnerType: 'Partner type', partnerStatus: 'Operational status', attention: 'Needs attention' }

export function locationLabel(partner: HQPartnerRecord) {
  const status = partner.locationVerificationStatus
  if (status === 'TownSelected') return 'Approximate town location'
  if (status === 'NotApplicableMobile') return 'Mobile location evidence'
  if (status === 'ExceptionApproved') return 'Location exception approved'
  if (status === 'GPSVerified') return 'Workplace coordinates recorded'
  return 'Location evidence pending'
}
export function partnerAttention(partner: HQPartnerRecord) {
  const reasons = []
  if (partner.approvalStatus === 'PendingHQApproval') reasons.push('HQ approval pending')
  if (partner.approvalStatus === 'Rejected') reasons.push('HQ approval rejected')
  if (partner.status !== 'Active') reasons.push('Partner inactive')
  if (!partner.programs?.length) reasons.push('Programme eligibility missing')
  if (!partner.contactEmail) reasons.push('Email missing')
  if (!partner.mouDocumentUrl) reasons.push('MoU document missing')
  if (!partner.locationVerificationStatus || partner.locationVerificationStatus === 'PendingGPS') reasons.push('Location evidence pending')
  return reasons
}
