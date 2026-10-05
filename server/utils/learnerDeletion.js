import mongoose from 'mongoose';
import { Learner } from '../models/Learner.js';
import { User } from '../models/User.js';
import { Placement } from '../models/Placement.js';
import { PlacementTransfer } from '../models/PlacementTransfer.js';
import { PlacementRequest } from '../models/PlacementRequest.js';
import { MonitoringVisit } from '../models/MonitoringVisit.js';
import { CompetencyAssessment } from '../models/CompetencyAssessment.js';
import { EmployerEvaluation } from '../models/EmployerEvaluation.js';
import { AttendanceLog } from '../models/AttendanceLog.js';
import { GuardianConsent } from '../models/GuardianConsent.js';
import { PlacementAgreement } from '../models/PlacementAgreement.js';
import { Document } from '../models/Document.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { SemesterReport } from '../models/SemesterReport.js';
import { logAuditEvent } from './audit.js';

const references = [
  [Placement, 'learner'], [PlacementTransfer, 'learner'], [PlacementRequest, 'learners'],
  [MonitoringVisit, 'learner'], [CompetencyAssessment, 'learner'], [EmployerEvaluation, 'learner'],
  [AttendanceLog, 'learner'], [GuardianConsent, 'learner'], [PlacementAgreement, 'learner'],
  [Document, 'learner'], [SupportTicket, 'learner'], [User, 'linkedLearners'],
  [SemesterReport, 'cohortLearners.learner'], [SemesterReport, 'exceptions.learnerId'],
];

export function validateBulkLearnerIds(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !mongoose.isObjectIdOrHexString(id))) {
    return 'Select between 1 and 100 valid learners.';
  }
  if (new Set(ids.map(id => String(id).toLowerCase())).size !== ids.length) return 'Each learner must be selected only once.';
  return null;
}

export async function bulkDeleteLearners(req, assertLease, { bulk = true, learnerIds = req.body.learnerIds } = {}) {
  const ids = learnerIds.map(id => String(id).toLowerCase());
  const learners = await Learner.find({ _id: { $in: ids }, institution: req.user.institution }).lean();
  const matchedIds = learners.map(learner => learner._id);
  // Read dependencies in batches; retain every historical reference rather than
  // removing evidence or cascading through unrelated business workflows.
  const linked = matchedIds.length ? await Promise.all(references.map(([model, field]) => model.distinct(field, { [field]: { $in: matchedIds } }))) : [];
  const blocked = new Set(linked.flat().map(String));
  const byId = new Map(learners.map(learner => [String(learner._id), learner]));
  const deletedIds = [], skipped = [];
  for (const id of ids) {
    const learner = byId.get(String(id));
    const name = learner ? [learner.lastName, learner.middleName, learner.firstName].filter(Boolean).join(' ') : undefined;
    if (!learner) {
      skipped.push({ id, reason: 'Not found or outside your institution.' });
    } else if (blocked.has(String(id))) {
      skipped.push({ id, name, reason: 'Linked placement, learning, support, or guardian records must be retained.' });
    } else {
      await assertLease();
      const result = await Learner.deleteOne({ _id: learner._id, institution: req.user.institution, workflowVersion: learner.workflowVersion ?? null });
      if (!result.deletedCount) {
        skipped.push({ id, name, reason: 'The learner changed. Refresh the registry and try again.' });
        continue;
      }
      deletedIds.push(String(id));
      await logAuditEvent({ req, action: 'DELETE', entityType: 'Learner', entityId: learner._id,
        summary: `${bulk ? 'Bulk deleted' : 'Deleted'} learner ${name}`, before: learner, metadata: { bulkDelete: bulk } });
    }
  }
  return { deletedCount: deletedIds.length, deletedIds, skipped };
}
