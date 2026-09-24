import { AttendanceLog } from '../models/AttendanceLog.js';
import { Document } from '../models/Document.js';
import { EmployerEvaluation } from '../models/EmployerEvaluation.js';
import { PartnerSlotAllocation } from '../models/PartnerSlotAllocation.js';
import { Placement } from '../models/Placement.js';
import { PlacementAgreement } from '../models/PlacementAgreement.js';
import { PlacementMessage } from '../models/PlacementMessage.js';
import { PlacementRequest } from '../models/PlacementRequest.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { User } from '../models/User.js';
import { Vacancy } from '../models/Vacancy.js';

export const PARTNER_DEPENDENCY_LABELS = Object.freeze({
  placements: 'placements',
  placementRequests: 'placement requests',
  attendanceLogs: 'attendance records',
  employerEvaluations: 'employer evaluations',
  slotAllocations: 'reserved slot allocations',
  placementAgreements: 'placement agreements',
  placementMessages: 'placement messages',
  vacancies: 'vacancies',
  portalAccounts: 'portal accounts',
  documents: 'documents',
  supportTickets: 'support tickets',
  linkedInstitutions: 'linked institutions',
  reportedUsedSlots: 'reported used slots',
});

const dependencyQueries = partnerId => ({
  placements: Placement.countDocuments({ partner: partnerId }),
  placementRequests: PlacementRequest.countDocuments({ partner: partnerId }),
  attendanceLogs: AttendanceLog.countDocuments({ partner: partnerId }),
  employerEvaluations: EmployerEvaluation.countDocuments({ partner: partnerId }),
  slotAllocations: PartnerSlotAllocation.countDocuments({ partner: partnerId }),
  placementAgreements: PlacementAgreement.countDocuments({ partner: partnerId }),
  placementMessages: PlacementMessage.countDocuments({ senderPartnerId: partnerId }),
  vacancies: Vacancy.countDocuments({ partner: partnerId }),
  portalAccounts: User.countDocuments({ partnerId }),
  documents: Document.countDocuments({ partnerId }),
  supportTickets: SupportTicket.countDocuments({ partnerId }),
});

export async function getPartnerDependencySummary(partnerId) {
  const entries = Object.entries(dependencyQueries(partnerId));
  const counts = await Promise.all(entries.map(([, query]) => query));
  return Object.fromEntries(entries.map(([key], index) => [key, Number(counts[index] || 0)]));
}

export function getPartnerDeletionBlockers(dependencies, reviewHistoryCount = 0) {
  const blockers = Object.entries(dependencies)
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => ({ key, label: PARTNER_DEPENDENCY_LABELS[key] || key, count: Number(count) }));
  if (reviewHistoryCount > 0) {
    blockers.push({ key: 'reviewHistory', label: 'partner review records', count: reviewHistoryCount });
  }
  return blockers;
}
