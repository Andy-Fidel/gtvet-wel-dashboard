import express from 'express';
import mongoose from 'mongoose';
import { Learner } from '../models/Learner.js';
import { Placement } from '../models/Placement.js';
import { MonitoringVisit } from '../models/MonitoringVisit.js';
import { SemesterReport } from '../models/SemesterReport.js';
import { User } from '../models/User.js';
import { Institution } from '../models/Institution.js';
import { CompetencyAssessment } from '../models/CompetencyAssessment.js';
import { AcademicCalendar } from '../models/AcademicCalendar.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { PlacementRequest } from '../models/PlacementRequest.js';
import { EmployerEvaluation } from '../models/EmployerEvaluation.js';
import { AttendanceLog } from '../models/AttendanceLog.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { AuditLog } from '../models/AuditLog.js';
import { PlacementMessage } from '../models/PlacementMessage.js';
import { SystemSetting } from '../models/SystemSetting.js';
import { AcademicTerm } from '../models/AcademicTerm.js';
import { Document } from '../models/Document.js';
import { AccessApproval } from '../models/AccessApproval.js';
import { GuardianConsent } from '../models/GuardianConsent.js';
import { PlacementAgreement } from '../models/PlacementAgreement.js';
import { auth, requireRole } from '../middleware/auth.js';
import { Parser } from 'json2csv';
import { sendPlacementApprovalEmail, sendReportStatusEmail } from '../utils/mailer.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Notification } from '../models/Notification.js';
import { notifyUsers } from '../utils/notifications.js';
import { logAuditEvent } from '../utils/audit.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';
import { canSendWhatsApp, sendWhatsAppMessage } from '../utils/whatsapp.js';

const router = express.Router();

// All routes below require authentication
router.use(auth);

// Helper: get institution filter (SuperAdmin sees all, RegionalAdmin sees their region)
const getFilter = async (user) => {
  if (user.role === 'SuperAdmin') return {};
  if (user.role === 'RegionalAdmin') {
     const insts = await Institution.find({ region: user.region }).select('name');
     const instNames = insts.map(i => i.name);
     return { institution: { $in: instNames } };
  }
  return { institution: user.institution };
};

// Helper: Notify Institution Admins
const notifyInstitutionAdmins = async (institutionName, emailFn, ...args) => {
    try {
        const admins = await User.find({ role: 'Admin', institution: institutionName });
        const emails = admins.map(u => u.email).filter(e => e).join(',');
        if (emails) {
            await emailFn(emails, ...args);
        }
    } catch(e) {
        console.error("Notify err:", e);
    }
}

const getPartnerId = (user) => user?.partnerId?._id || user?.partnerId || null;

const buildAttendanceScope = async (user) => {
  if (user.role === 'IndustryPartner') {
    return { partner: getPartnerId(user) };
  }
  if (user.role === 'SuperAdmin' || user.role === 'RegionalAdmin') {
    return getFilter(user);
  }
  // Institution users: include attendance for own-institution AND delegated placements
  const delegatedPlacementIds = await Placement.find({ delegate: user._id, status: 'Active' }).distinct('_id');
  if (delegatedPlacementIds.length > 0) {
    return {
      $or: [
        { institution: user.institution },
        { placement: { $in: delegatedPlacementIds } },
      ]
    };
  }
  return { institution: user.institution };
};

const validateAttendancePayload = ({ entryType, periodStart, periodEnd, hoursWorked }) => {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Invalid attendance date range';
  }

  if (end < start) {
    return 'Period end cannot be before period start';
  }

  if (entryType === 'Daily' && start.toDateString() !== end.toDateString()) {
    return 'Daily entries must start and end on the same date';
  }

  if (entryType === 'Weekly') {
    const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays > 6) {
      return 'Weekly entries cannot span more than 7 days';
    }
  }

  if (entryType === 'Daily' && (hoursWorked < 0 || hoursWorked > 24)) {
    return 'Daily entries must be between 0 and 24 hours';
  }

  if (entryType === 'Weekly' && (hoursWorked < 0 || hoursWorked > 168)) {
    return 'Weekly entries must be between 0 and 168 hours';
  }

  return null;
};

const buildStaleUpdateConflict = ({ entityType, currentRecord, clientPayload, clientUpdatedAt, fields }) => ({
  message: `${entityType} was updated on the server after this offline edit was created.`,
  conflict: {
    reason: 'stale_update',
    entityType,
    serverUpdatedAt: currentRecord.updatedAt,
    clientUpdatedAt,
    changedFields: fields.map((field) => ({
      field,
      serverValue: currentRecord[field] ?? null,
      clientValue: clientPayload[field] ?? null,
    })),
  },
});

const getSupportTicketScope = async (user) => {
  if (user.role === 'SuperAdmin') return {};
  if (user.role === 'RegionalAdmin') {
    const insts = await Institution.find({ region: user.region }).select('name');
    return { institution: { $in: insts.map((inst) => inst.name) } };
  }
  if (user.role === 'IndustryPartner') {
    return { partnerId: getPartnerId(user) };
  }
  if (user.role === 'Guardian') {
    return { requester: user._id };
  }
  return { institution: user.institution };
};

const getGuardianLearnerIds = async (user) => {
  if (user.role !== 'Guardian') return [];
  const hydratedUser = await User.findById(user._id).select('linkedLearners');
  return (hydratedUser?.linkedLearners || []).map((learnerId) => learnerId.toString());
};

const getAccessApprovalScope = async (user) => {
  if (user.role === 'SuperAdmin') return {};
  if (user.role === 'RegionalAdmin') {
    return {
      $or: [
        { requester: user._id },
        { region: user.region },
      ],
    };
  }
  return {
    $or: [
      { requester: user._id },
      { institution: user.institution || 'N/A' },
    ],
  };
};

const resolveCurrentAcademicYear = async () => {
  const activeTerm = await AcademicTerm.findOne({ $or: [{ isCurrent: true }, { status: 'Active' }] })
    .sort({ isCurrent: -1, startDate: -1 })
    .select('academicYear')
    .lean();

  if (activeTerm?.academicYear) {
    return activeTerm.academicYear;
  }

  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
};

const resolveAcademicYearFromDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const startYear = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
};

const buildPlacementHistory = (placements = []) => placements.map((placement, index) => ({
  placementId: placement._id,
  cycleNumber: placements.length - index,
  academicYear: placement.academicYear || resolveAcademicYearFromDate(placement.startDate),
  companyName: placement.companyName,
  partnerName: placement.partner?.name || '',
  sector: placement.sector,
  location: placement.location,
  supervisorName: placement.supervisorName || '',
  startDate: placement.startDate || null,
  endDate: placement.endDate || null,
  status: placement.status,
  institution: placement.institution,
  owner: placement.owner || null,
  createdAt: placement.createdAt,
  updatedAt: placement.updatedAt,
}));

const calculateAgeYears = (dateOfBirth, referenceDate = new Date()) => {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  let age = referenceDate.getFullYear() - dob.getFullYear();
  const monthDiff = referenceDate.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
};

const isLearnerUnder18 = (learner, referenceDate = new Date()) => {
  const age = calculateAgeYears(learner?.dateOfBirth, referenceDate);
  return typeof age === 'number' ? age < 18 : false;
};

const buildGuardianConsentSummary = ({ learner, placement, consentRecord }) => ({
  requiresConsent: isLearnerUnder18(learner),
  hasDateOfBirth: Boolean(learner?.dateOfBirth),
  age: calculateAgeYears(learner?.dateOfBirth),
  status: consentRecord ? 'Signed' : 'Pending',
  signedAt: consentRecord?.signedAt || null,
  signedByName: consentRecord?.guardianDetails?.fullName || '',
  relationshipToLearner: consentRecord?.guardianDetails?.relationshipToLearner || '',
  contactNumber: consentRecord?.guardianDetails?.contactNumber || '',
  industryName: consentRecord?.placementSnapshot?.industryName || placement?.companyName || '',
  startDate: consentRecord?.placementSnapshot?.startDate || placement?.startDate || null,
  endDate: consentRecord?.placementSnapshot?.endDate || placement?.endDate || null,
  placementId: consentRecord?.placement?.toString?.() || placement?._id?.toString?.() || null,
});

const buildPlacementAgreementSummary = ({ placement, learner, agreement }) => ({
  placementId: placement?._id?.toString?.() || agreement?.placement?.toString?.() || null,
  employerSigned: Boolean(agreement?.employerAcknowledgement?.signed),
  employerSignedAt: agreement?.employerAcknowledgement?.signedAt || null,
  employerSignerName: agreement?.employerAcknowledgement?.signerName || '',
  employerBusinessName: agreement?.employerAcknowledgement?.businessRepresentativeName || placement?.companyName || '',
  employerSignatureName: agreement?.employerAcknowledgement?.signatureName || '',
  learnerSigned: Boolean(agreement?.learnerAgreement?.signed),
  learnerSignedAt: agreement?.learnerAgreement?.signedAt || null,
  learnerSignerName: agreement?.learnerAgreement?.learnerName || learner?.name || '',
  learnerSignatureName: agreement?.learnerAgreement?.signatureName || '',
  fullySigned: Boolean(agreement?.employerAcknowledgement?.signed && agreement?.learnerAgreement?.signed),
});

const nextStudyYear = (year) => {
  if (year === 'Year 1') return 'Year 2';
  if (year === 'Year 2') return 'Year 3';
  return null;
};

const canManageSupportTicketStatus = (user, ticket) => {
  if (user.role === 'SuperAdmin') return true;
  if (user.role === 'RegionalAdmin') return true;
  if (user.role === 'Admin') return true;
  return ticket.requester?.toString() === user._id.toString();
};

const canManageSupportAssignments = (user) => ['SuperAdmin', 'RegionalAdmin', 'Admin'].includes(user.role);
const canManageOperationalOwnership = (user) => ['Admin', 'Manager', 'SuperAdmin', 'RegionalAdmin'].includes(user.role);

const canActOnPartnerPlacement = (user, placement) => {
  if (user.role !== 'IndustryPartner') return true;
  const userPartnerId = getPartnerId(user)?.toString();
  const placementPartnerId = placement?.partner?._id?.toString?.() || placement?.partner?.toString?.();
  if (!userPartnerId || !placementPartnerId || placementPartnerId !== userPartnerId) return false;
  if (!placement.partnerSupervisor) return true;
  const assignedSupervisorId = placement.partnerSupervisor?._id?.toString?.() || placement.partnerSupervisor?.toString?.();
  return assignedSupervisorId === user._id.toString();
};

const getRequesterAwaitingParty = (role) => {
  if (role === 'IndustryPartner') return 'Support';
  return 'Support';
};

const getReplyAwaitingParty = (role) => {
  if (role === 'IndustryPartner') return 'Support';
  if (['SuperAdmin', 'RegionalAdmin', 'Admin'].includes(role)) return 'Partner';
  return 'Support';
};

const getSlaTargets = (priority) => {
  const firstResponseHours = {
    Low: 24,
    Medium: 8,
    High: 4,
    Urgent: 1,
  };

  const resolutionHours = {
    Low: 120,
    Medium: 72,
    High: 24,
    Urgent: 8,
  };

  return {
    firstResponseHours: firstResponseHours[priority] || 8,
    resolutionHours: resolutionHours[priority] || 72,
  };
};

const computeSlaStatus = (ticket) => {
  const now = Date.now();
  const firstResponseBreached = !ticket.firstRespondedAt && ticket.firstResponseDueAt && new Date(ticket.firstResponseDueAt).getTime() < now;
  const resolutionBreached = !['Resolved', 'Closed'].includes(ticket.status) && ticket.resolutionDueAt && new Date(ticket.resolutionDueAt).getTime() < now;

  return {
    firstResponseBreached,
    resolutionBreached,
    hasBreach: Boolean(firstResponseBreached || resolutionBreached),
  };
};

const withSupportTicketMeta = (ticketDoc) => {
  const ticket = ticketDoc.toObject ? ticketDoc.toObject() : ticketDoc;
  return {
    ...ticket,
    slaStatus: computeSlaStatus(ticket),
  };
};

const withSupportTicketViewerMeta = (ticketDoc, user) => {
  const ticket = withSupportTicketMeta(ticketDoc);
  const readState = (ticket.readStates || []).find((entry) => entry.user?.toString() === user._id.toString());
  const lastReadAt = readState?.lastReadAt ? new Date(readState.lastReadAt) : null;
  const lastActivityAt = ticket.lastActivityAt ? new Date(ticket.lastActivityAt) : new Date(ticket.updatedAt || ticket.createdAt);
  const hasUnreadChanges = Boolean(
    ticket.lastActivityBy
    && ticket.lastActivityBy.toString() !== user._id.toString()
    && (!lastReadAt || lastActivityAt.getTime() > lastReadAt.getTime())
  );

  return {
    ...ticket,
    hasUnreadChanges,
    lastReadAt: readState?.lastReadAt || null,
    isOwnedByCurrentUser: Boolean(ticket.assignedTo?._id?.toString() === user._id.toString() || ticket.escalatedTo?._id?.toString() === user._id.toString()),
  };
};

const markSupportTicketReadForUser = (ticket, userId) => {
  const existing = ticket.readStates.find((entry) => entry.user.toString() === userId.toString());
  if (existing) {
    existing.lastReadAt = new Date();
  } else {
    ticket.readStates.push({ user: userId, lastReadAt: new Date() });
  }
};

const calculatePlacementManagementSummary = ({
  placement,
  attendanceLogs = [],
  visits = [],
  assessments = [],
  evaluations = [],
  supportTickets = [],
  cadenceSettings = {},
}) => {
  if (!placement) return null;

  const startDate = placement.startDate ? new Date(placement.startDate) : null;
  const endDate = placement.endDate ? new Date(placement.endDate) : null;
  const now = new Date();
  const attendanceCadenceDays = cadenceSettings.attendanceCadenceDays || 7;
  const monitoringVisitCadenceDays = cadenceSettings.monitoringVisitCadenceDays || 30;
  const midpointAssessmentOffsetDays = cadenceSettings.midpointAssessmentOffsetDays || 45;
  const finalAssessmentOffsetDays = cadenceSettings.finalAssessmentOffsetDays ?? 0;
  const employerEvaluationOffsetDays = cadenceSettings.employerEvaluationOffsetDays ?? 0;
  const placementDurationMs = startDate && endDate ? endDate.getTime() - startDate.getTime() : null;
  const midpointDate = startDate && placementDurationMs
    ? new Date(startDate.getTime() + placementDurationMs / 2)
    : startDate
      ? new Date(startDate.getTime() + midpointAssessmentOffsetDays * 24 * 60 * 60 * 1000)
      : null;
  const finalAssessmentDueAt = endDate
    ? new Date(endDate.getTime() + finalAssessmentOffsetDays * 24 * 60 * 60 * 1000)
    : null;
  const evaluationDueAt = endDate
    ? new Date(endDate.getTime() + employerEvaluationOffsetDays * 24 * 60 * 60 * 1000)
    : null;

  const latestAttendance = attendanceLogs[0] || null;
  const latestVisit = visits[0] || null;
  const latestAssessment = assessments[0] || null;
  const latestEvaluation = evaluations[0] || null;

  const attendanceDueAt = latestAttendance
    ? new Date(new Date(latestAttendance.periodEnd).getTime() + attendanceCadenceDays * 24 * 60 * 60 * 1000)
    : startDate
      ? new Date(startDate.getTime() + attendanceCadenceDays * 24 * 60 * 60 * 1000)
      : null;

  const monitoringDueAt = latestVisit
    ? new Date(new Date(latestVisit.visitDate).getTime() + monitoringVisitCadenceDays * 24 * 60 * 60 * 1000)
    : startDate
      ? new Date(startDate.getTime() + monitoringVisitCadenceDays * 24 * 60 * 60 * 1000)
      : null;

  const assessmentStatus = latestAssessment
    ? {
        complete: true,
        latestAt: latestAssessment.assessmentDate,
        dueAt: finalAssessmentDueAt,
        overdue: Boolean(finalAssessmentDueAt && new Date(finalAssessmentDueAt) < now && assessments.length < 2),
        summary: assessments.length > 1 ? 'Midpoint and final assessments captured' : 'Initial assessment captured',
      }
    : {
        complete: false,
        latestAt: null,
        dueAt: midpointDate || finalAssessmentDueAt,
        overdue: Boolean((midpointDate || finalAssessmentDueAt) && (midpointDate || finalAssessmentDueAt) < now),
        summary: midpointDate ? 'Midpoint assessment pending' : 'Assessment pending',
      };

  const evaluationStatus = latestEvaluation
    ? {
        complete: true,
        latestAt: latestEvaluation.evaluationDate,
        dueAt: evaluationDueAt,
        overdue: false,
      }
    : {
        complete: false,
        latestAt: null,
        dueAt: evaluationDueAt,
        overdue: Boolean(evaluationDueAt && evaluationDueAt < now),
      };

  return {
    attendance: {
      latestAt: latestAttendance?.periodEnd || null,
      dueAt: attendanceDueAt,
      overdue: Boolean(attendanceDueAt && attendanceDueAt < now),
      pendingSignOffCount: attendanceLogs.filter((log) => log.status === 'Pending').length,
    },
    monitoring: {
      latestAt: latestVisit?.visitDate || null,
      dueAt: monitoringDueAt,
      overdue: Boolean(monitoringDueAt && monitoringDueAt < now),
      visitCount: visits.length,
    },
    assessments: assessmentStatus,
    evaluations: evaluationStatus,
    blockers: {
      totalOpen: supportTickets.length,
      escalated: supportTickets.filter((ticket) => ticket.escalationLevel && ticket.escalationLevel !== 'None').length,
      items: supportTickets.map((ticket) => withSupportTicketMeta(ticket)),
    },
  };
};

const getAuditLogScope = async (user) => {
  if (user.role === 'SuperAdmin') return {};
  if (user.role === 'RegionalAdmin') {
    const insts = await Institution.find({ region: user.region }).select('name');
    return { institution: { $in: insts.map((inst) => inst.name) } };
  }
  return { institution: user.institution };
};

// Placement filter: includes delegated placements for institution-level users
const getPlacementFilter = async (user) => {
  if (user.role === 'SuperAdmin') return {};
  if (user.role === 'RegionalAdmin') {
     const insts = await Institution.find({ region: user.region }).select('name');
     const instNames = insts.map(i => i.name);
     return { institution: { $in: instNames } };
  }
  if (user.role === 'IndustryPartner') {
    return { partner: getPartnerId(user) };
  }
  // Institution staff: own institution OR delegated to them
  return {
    $or: [
      { institution: user.institution },
      { delegate: user._id },
    ]
  };
};

const getPlacementScope = async (user) => {
  return getPlacementFilter(user);
};

const findPlacementForUser = async (user, placementId) => {
  const scope = await getPlacementScope(user);
  return Placement.findOne({ _id: placementId, ...scope })
    .populate('learner', 'name trackingId firstName lastName program')
    .populate('partner', 'name sector region');
};

const getOrCreateSystemSettings = async () => {
  let settings = await SystemSetting.findOne({ key: 'global' });
  if (!settings) {
    settings = await SystemSetting.create({ key: 'global' });
  }
  return settings;
};

const getManageableUserRoles = (actorRole) => {
  if (actorRole === 'SuperAdmin') {
    return ['SuperAdmin', 'RegionalAdmin', 'Admin', 'Manager', 'Staff', 'IndustryPartner', 'Guardian'];
  }
  if (actorRole === 'RegionalAdmin') {
    return ['Admin', 'Manager', 'Staff', 'Guardian'];
  }
  if (actorRole === 'Admin') {
    return ['Manager', 'Staff', 'Guardian'];
  }
  return [];
};

const PRIVILEGED_USER_ROLES = ['SuperAdmin', 'RegionalAdmin', 'Admin'];

const getUserLifecycleState = (user) => {
  if (user.status === 'Inactive') {
    return { code: 'Inactive', label: 'Inactive' };
  }

  if (user.resetPasswordToken && user.resetPasswordExpires && new Date(user.resetPasswordExpires).getTime() > Date.now()) {
    return {
      code: user.inviteAcceptedAt ? 'ResetPending' : 'Invited',
      label: user.inviteAcceptedAt ? 'Reset Pending' : 'Invited',
    };
  }

  if (user.passwordChangeRequired) {
    return {
      code: user.inviteAcceptedAt ? 'PasswordChangeRequired' : 'Invited',
      label: user.inviteAcceptedAt ? 'Password Change Required' : 'Invited',
    };
  }

  return { code: 'Active', label: 'Active' };
};

const withUserLifecycleMeta = (userDoc) => {
  const user = userDoc.toObject ? userDoc.toObject() : userDoc;
  return {
    ...user,
    lifecycleStatus: getUserLifecycleState(user),
  };
};

const SENSITIVE_USER_AUDIT_FIELDS = new Set([
  'role',
  'status',
  'password',
  'passwordChangeRequired',
  'resetPasswordToken',
  'resetPasswordExpires',
  'partnerId',
  'institution',
  'region',
]);

const attachUserAuditSummaries = async (users) => {
  if (!users.length) return [];

  const userIds = users.map((user) => user._id.toString());
  const userObjectIds = users.map((user) => user._id);
  const institutionNames = [...new Set(users.map((user) => user.institution).filter(Boolean))];

  const [userLogs, authLogs, institutions, learnerOwnership, placementOwnership] = await Promise.all([
    AuditLog.find({
      entityType: 'User',
      entityId: { $in: userIds },
    })
      .sort({ createdAt: -1 })
      .lean(),
    AuditLog.find({
      action: 'AUTH',
      entityType: 'AuthSession',
      entityId: { $in: userIds },
    })
      .sort({ createdAt: -1 })
      .lean(),
    institutionNames.length
      ? Institution.find({ name: { $in: institutionNames } }).select('name region').lean()
      : [],
    Learner.aggregate([
      { $match: { owner: { $in: userObjectIds } } },
      { $group: { _id: '$owner', count: { $sum: 1 } } },
    ]),
    Placement.aggregate([
      { $match: { owner: { $in: userObjectIds }, status: 'Active' } },
      { $group: { _id: '$owner', count: { $sum: 1 } } },
    ]),
  ]);

  const institutionRegionMap = new Map(
    institutions.map((institution) => [institution.name, institution.region || ''])
  );

  const logsByEntity = new Map();
  userLogs.forEach((log) => {
    if (!logsByEntity.has(log.entityId)) logsByEntity.set(log.entityId, []);
    logsByEntity.get(log.entityId).push(log);
  });

  const authLogsByEntity = new Map();
  authLogs.forEach((log) => {
    if (!authLogsByEntity.has(log.entityId)) authLogsByEntity.set(log.entityId, []);
    authLogsByEntity.get(log.entityId).push(log);
  });

  const learnerOwnershipMap = new Map(
    learnerOwnership.map((entry) => [entry._id?.toString(), entry.count || 0])
  );
  const placementOwnershipMap = new Map(
    placementOwnership.map((entry) => [entry._id?.toString(), entry.count || 0])
  );

  return users.map((user) => {
    const baseUser = withUserLifecycleMeta(user);
    const entityLogs = logsByEntity.get(user._id.toString()) || [];
    const entityAuthLogs = authLogsByEntity.get(user._id.toString()) || [];

    const createdEvent = [...entityLogs].reverse().find((log) => log.action === 'CREATE');
    const lastRoleChange = entityLogs.find((log) => (log.changedFields || []).includes('role'));
    const failedLoginCount = entityAuthLogs.filter((log) => log.metadata?.outcome === 'FAILED').length;
    const recentSensitiveActions = entityLogs
      .filter((log) => {
        const changedFields = log.changedFields || [];
        return log.action === 'DELETE'
          || log.action === 'CREATE'
          || changedFields.some((field) => SENSITIVE_USER_AUDIT_FIELDS.has(field));
      })
      .slice(0, 5)
      .map((log) => ({
        _id: log._id,
        action: log.action,
        summary: log.summary,
        actorName: log.actorName,
        actorRole: log.actorRole,
        changedFields: log.changedFields || [],
        createdAt: log.createdAt,
      }));

    return {
      ...baseUser,
      effectiveRegion: baseUser.region || (baseUser.institution ? institutionRegionMap.get(baseUser.institution) || '' : ''),
      workloadSummary: {
        learnersOwned: learnerOwnershipMap.get(user._id.toString()) || 0,
        activePlacementsOwned: placementOwnershipMap.get(user._id.toString()) || 0,
      },
      auditSummary: {
        createdBy: createdEvent ? {
          actorName: createdEvent.actorName,
          actorRole: createdEvent.actorRole,
          createdAt: createdEvent.createdAt,
        } : null,
        lastRoleChange: lastRoleChange ? {
          actorName: lastRoleChange.actorName,
          actorRole: lastRoleChange.actorRole,
          createdAt: lastRoleChange.createdAt,
        } : null,
        lastLoginAt: baseUser.lastLoginAt || null,
        failedLoginCount,
        recentSensitiveActions,
      },
    };
  });
};

const getUserDeactivationImpact = async (userId) => {
  const [ownedLearners, ownedPlacements, supervisorPlacements, assignedTickets, escalatedTickets] = await Promise.all([
    Learner.find({ owner: userId }).select('_id trackingId firstName lastName lastName institution status').lean(),
    Placement.find({ owner: userId, status: 'Active' }).populate('learner', 'trackingId firstName lastName middleName').select('_id companyName status learner institution').lean(),
    Placement.find({ partnerSupervisor: userId, status: 'Active' }).populate('learner', 'trackingId firstName lastName middleName').select('_id companyName status learner institution partner').lean(),
    SupportTicket.find({ assignedTo: userId, status: { $in: ['Open', 'InProgress'] } }).select('_id subject status institution').lean(),
    SupportTicket.find({ escalatedTo: userId, status: { $in: ['Open', 'InProgress'] } }).select('_id subject status institution').lean(),
  ]);

  return {
    learnersOwned: ownedLearners.map((learner) => ({
      _id: learner._id,
      trackingId: learner.trackingId,
      name: [learner.lastName, learner.firstName, learner.middleName].filter(Boolean).join(' '),
      institution: learner.institution,
      status: learner.status,
    })),
    activePlacementsOwned: ownedPlacements.map((placement) => ({
      _id: placement._id,
      companyName: placement.companyName,
      learnerTrackingId: placement.learner?.trackingId || '',
      learnerName: placement.learner ? [placement.learner.lastName, placement.learner.firstName, placement.learner.middleName].filter(Boolean).join(' ') : '',
      institution: placement.institution,
    })),
    partnerPlacementsAssigned: supervisorPlacements.map((placement) => ({
      _id: placement._id,
      companyName: placement.companyName,
      learnerTrackingId: placement.learner?.trackingId || '',
      learnerName: placement.learner ? [placement.learner.lastName, placement.learner.firstName, placement.learner.middleName].filter(Boolean).join(' ') : '',
      institution: placement.institution,
      partnerId: placement.partner?.toString?.() || '',
    })),
    supportAssignments: assignedTickets,
    supportEscalations: escalatedTickets,
  };
};

const hasDeactivationBlockers = (impact) => {
  return (
    impact.learnersOwned.length > 0
    || impact.activePlacementsOwned.length > 0
    || impact.partnerPlacementsAssigned.length > 0
    || impact.supportAssignments.length > 0
    || impact.supportEscalations.length > 0
  );
};

const normalizeUserPayloadForRole = async (actor, payload, existingUser = null) => {
  const normalized = { ...payload };
  const targetRole = payload.role || existingUser?.role;

  if (!targetRole) {
    return { status: 400, message: 'Role is required' };
  }

  const manageableRoles = getManageableUserRoles(actor.role);
  if (!manageableRoles.includes(targetRole)) {
    return { status: 403, message: `Forbidden: You cannot assign the ${targetRole} role` };
  }

  if (actor.role !== 'SuperAdmin' && targetRole === 'IndustryPartner') {
    return { status: 403, message: 'Forbidden: Only SuperAdmins can manage Industry Partner accounts' };
  }

  if (targetRole === 'SuperAdmin') {
    normalized.institution = 'N/A';
    normalized.region = '';
    normalized.partnerId = undefined;
    normalized.linkedLearners = [];
    return { normalized };
  }

  if (targetRole === 'RegionalAdmin') {
    if (!normalized.region?.trim()) {
      return { status: 400, message: 'Region is required for Regional Admins' };
    }
    normalized.region = normalized.region.trim();
    normalized.institution = 'N/A';
    normalized.partnerId = undefined;
    normalized.linkedLearners = [];
    return { normalized };
  }

  if (targetRole === 'IndustryPartner') {
    if (!normalized.partnerId) {
      return { status: 400, message: 'Industry Partner is required for this role' };
    }

    const partner = await IndustryPartner.findById(normalized.partnerId).select('_id region');
    if (!partner) {
      return { status: 400, message: 'Selected industry partner was not found' };
    }

    normalized.institution = 'N/A';
    normalized.region = partner.region || '';
    normalized.linkedLearners = [];
    return { normalized };
  }

  if (targetRole === 'Guardian') {
    const learnerIds = Array.isArray(normalized.linkedLearners)
      ? normalized.linkedLearners.filter(Boolean)
      : [];

    if (learnerIds.length === 0) {
      return { status: 400, message: 'At least one learner must be linked to a guardian account' };
    }

    const learnerScope = await getFilter(actor);
    const learners = await Learner.find({
      _id: { $in: learnerIds },
      ...learnerScope,
    }).select('_id institution region');

    if (learners.length !== learnerIds.length) {
      return { status: 400, message: 'One or more selected learners are outside your management scope' };
    }

    const institutionNames = [...new Set(learners.map((learner) => learner.institution).filter(Boolean))];
    const regions = [...new Set(learners.map((learner) => learner.region).filter(Boolean))];

    normalized.linkedLearners = learners.map((learner) => learner._id);
    normalized.institution = institutionNames.length === 1 ? institutionNames[0] : 'Multi-Institution';
    normalized.region = regions.length === 1 ? regions[0] : '';
    normalized.partnerId = undefined;
    return { normalized };
  }

  let institutionName = normalized.institution?.trim();
  if (actor.role === 'Admin') {
    institutionName = actor.institution;
  }

  if (!institutionName) {
    return { status: 400, message: 'Institution is required for this role' };
  }

  const institution = await Institution.findOne({ name: institutionName }).select('name region');
  if (!institution) {
    return { status: 400, message: 'Selected institution was not found' };
  }

  if (actor.role === 'RegionalAdmin' && institution.region !== actor.region) {
    return { status: 403, message: 'Forbidden: Institution is outside your region' };
  }

  normalized.institution = institution.name;
  normalized.region = institution.region || '';
  normalized.partnerId = undefined;
  normalized.linkedLearners = [];
  return { normalized };
};

const requirePrivilegedRoleConfirmation = (actor, payload, existingUser = null) => {
  const targetRole = payload.role || existingUser?.role;
  const previousRole = existingUser?.role || null;
  const isPrivilegedTarget = PRIVILEGED_USER_ROLES.includes(targetRole);
  const isNewPrivilegedAssignment = isPrivilegedTarget && previousRole !== targetRole;

  if (!isNewPrivilegedAssignment) {
    return null;
  }

  if (payload.privilegedRoleConfirmed === true) {
    return null;
  }

  return {
    status: 409,
    message: `Confirm assignment of privileged role ${targetRole} before saving this user.`,
    confirmationRequired: {
      role: targetRole,
      previousRole,
      scope: targetRole === 'SuperAdmin'
        ? 'Platform-wide governance'
        : targetRole === 'RegionalAdmin'
          ? `Regional governance for ${payload.region || existingUser?.region || 'the selected region'}`
          : `Institution administration for ${payload.institution || existingUser?.institution || 'the selected institution'}`,
    },
  };
};

const getOperationalOwnerCandidates = async (user) => {
  if (user.role === 'SuperAdmin') {
    return User.find({ role: { $in: ['Admin', 'Manager', 'Staff'] }, status: 'Active' })
      .select('_id name role institution')
      .sort({ institution: 1, name: 1 });
  }

  if (user.role === 'RegionalAdmin') {
    const institutions = await Institution.find({ region: user.region }).select('name');
    return User.find({
      role: { $in: ['Admin', 'Manager', 'Staff'] },
      status: 'Active',
      institution: { $in: institutions.map((inst) => inst.name) },
    })
      .select('_id name role institution')
      .sort({ institution: 1, name: 1 });
  }

  return User.find({
    role: { $in: ['Admin', 'Manager', 'Staff'] },
    status: 'Active',
    institution: user.institution,
  })
    .select('_id name role institution')
    .sort({ name: 1 });
};

const getVisibleSupportAssignees = async (user) => {
  const users = await User.find({ status: 'Active' })
    .select('name email role institution region partnerId');

  return users.filter((candidate) => {
    if (user.role === 'SuperAdmin') return ['SuperAdmin', 'RegionalAdmin', 'Admin'].includes(candidate.role);
    if (user.role === 'RegionalAdmin') {
      return candidate.role !== 'SuperAdmin' && (candidate.region === user.region || candidate.institution === user.institution);
    }
    return candidate.role !== 'SuperAdmin' && candidate.institution === user.institution;
  });
};

const getPlacementExceptionData = async (institution) => {
  const settings = await getOrCreateSystemSettings();
  const placements = await Placement.find({ institution, status: 'Active' })
    .populate('learner', 'name owner')
    .populate('owner', 'name role institution')
    .select('_id learner owner companyName supervisorName supervisorPhone supervisorEmail startDate endDate updatedAt institution')
    .lean();

  if (placements.length === 0) {
    return { settings, placements: [], attendanceByPlacement: new Map(), visitsByLearner: new Map(), assessmentsByLearner: new Map() };
  }

  const placementIds = placements.map((placement) => placement._id);
  const learnerIds = placements
    .map((placement) => placement.learner?._id || placement.learner)
    .filter(Boolean);

  const [attendanceLogs, visits, assessments] = await Promise.all([
    AttendanceLog.find({ placement: { $in: placementIds } })
      .select('placement periodEnd')
      .sort({ periodEnd: -1 })
      .lean(),
    MonitoringVisit.find({ learner: { $in: learnerIds } })
      .select('learner visitDate')
      .sort({ visitDate: -1 })
      .lean(),
    CompetencyAssessment.find({ learner: { $in: learnerIds } })
      .select('learner assessmentDate')
      .sort({ assessmentDate: -1 })
      .lean(),
  ]);

  const attendanceByPlacement = new Map();
  attendanceLogs.forEach((log) => {
    const key = log.placement.toString();
    if (!attendanceByPlacement.has(key)) {
      attendanceByPlacement.set(key, log);
    }
  });

  const visitsByLearner = new Map();
  visits.forEach((visit) => {
    const key = visit.learner.toString();
    if (!visitsByLearner.has(key)) {
      visitsByLearner.set(key, visit);
    }
  });

  const assessmentsByLearner = new Map();
  assessments.forEach((assessment) => {
    const key = assessment.learner.toString();
    const existing = assessmentsByLearner.get(key) || [];
    existing.push(assessment);
    assessmentsByLearner.set(key, existing);
  });

  return {
    settings,
    placements,
    attendanceByPlacement,
    visitsByLearner,
    assessmentsByLearner,
  };
};

const getPlacementExceptionSignals = ({ settings, placements, attendanceByPlacement, visitsByLearner, assessmentsByLearner }) => {
  const now = new Date();
  const attendanceCadenceMs = settings.attendanceCadenceDays * 24 * 60 * 60 * 1000;
  const monitoringCadenceMs = settings.monitoringVisitCadenceDays * 24 * 60 * 60 * 1000;
  const signals = [];

  placements.forEach((placement) => {
    const learnerId = placement.learner?._id?.toString?.() || placement.learner?.toString?.();
    const learnerName = placement.learner?.name || 'This learner';
    const placementId = placement._id.toString();
    const latestAttendance = attendanceByPlacement.get(placementId);
    const latestVisit = learnerId ? visitsByLearner.get(learnerId) : null;
    const learnerAssessments = learnerId ? (assessmentsByLearner.get(learnerId) || []) : [];

    const missingSupervisorFields = [];
    if (!placement.supervisorName?.trim()) missingSupervisorFields.push('name');
    if (!placement.supervisorPhone?.trim() && !placement.supervisorEmail?.trim()) missingSupervisorFields.push('contact');

    if (missingSupervisorFields.length > 0) {
      signals.push({
        type: 'placementSetup',
        placement,
        learnerName,
        placementId,
        dedupeKey: `placement-setup:${placementId}:${missingSupervisorFields.join('-')}:${placement.updatedAt ? new Date(placement.updatedAt).toISOString() : placementId}`,
        title: 'Placement setup incomplete',
        message: `${learnerName}'s placement at ${placement.companyName} is missing supervisor ${missingSupervisorFields.join(' and ')} details.`,
        link: '/placements',
      });
    }

    const attendanceDueAt = latestAttendance
      ? new Date(new Date(latestAttendance.periodEnd).getTime() + attendanceCadenceMs)
      : placement.startDate
        ? new Date(new Date(placement.startDate).getTime() + attendanceCadenceMs)
        : null;

    if (attendanceDueAt && attendanceDueAt < now) {
      signals.push({
        type: 'attendanceOverdue',
        placement,
        learnerName,
        placementId,
        dueAt: attendanceDueAt,
        dedupeKey: `attendance-overdue:${placementId}:${attendanceDueAt.toISOString().slice(0, 10)}`,
        title: 'Attendance follow-up overdue',
        message: `No attendance has been logged for ${learnerName} since ${attendanceDueAt.toLocaleDateString()}.`,
        link: '/attendance-logs',
      });
    }

    const monitoringDueAt = latestVisit
      ? new Date(new Date(latestVisit.visitDate).getTime() + monitoringCadenceMs)
      : placement.startDate
        ? new Date(new Date(placement.startDate).getTime() + monitoringCadenceMs)
        : null;

    if (monitoringDueAt && monitoringDueAt < now) {
      signals.push({
        type: 'monitoringOverdue',
        placement,
        learnerName,
        placementId,
        dueAt: monitoringDueAt,
        dedupeKey: `monitoring-overdue:${placementId}:${monitoringDueAt.toISOString().slice(0, 10)}`,
        title: 'Monitoring visit overdue',
        message: `${learnerName} is due for a monitoring visit. Expected by ${monitoringDueAt.toLocaleDateString()}.`,
        link: '/monitoring-visits',
      });
    }

    const startDate = placement.startDate ? new Date(placement.startDate) : null;
    const endDate = placement.endDate ? new Date(placement.endDate) : null;
    const placementDurationMs = startDate && endDate ? endDate.getTime() - startDate.getTime() : null;
    const midpointDueAt = startDate && placementDurationMs
      ? new Date(startDate.getTime() + placementDurationMs / 2)
      : startDate
        ? new Date(startDate.getTime() + settings.midpointAssessmentOffsetDays * 24 * 60 * 60 * 1000)
        : null;
    const finalDueAt = endDate
      ? new Date(endDate.getTime() + settings.finalAssessmentOffsetDays * 24 * 60 * 60 * 1000)
      : null;
    const assessmentCount = learnerAssessments.length;

    if (midpointDueAt && midpointDueAt < now && assessmentCount === 0) {
      signals.push({
        type: 'assessmentMidpointOverdue',
        placement,
        learnerName,
        placementId,
        dueAt: midpointDueAt,
        dedupeKey: `assessment-midpoint-overdue:${placementId}:${midpointDueAt.toISOString().slice(0, 10)}`,
        title: 'Midpoint assessment overdue',
        message: `${learnerName} does not have a midpoint competency assessment logged yet.`,
        link: '/assessments',
      });
    }

    if (finalDueAt && finalDueAt < now && assessmentCount < 2) {
      signals.push({
        type: 'assessmentFinalOverdue',
        placement,
        learnerName,
        placementId,
        dueAt: finalDueAt,
        dedupeKey: `assessment-final-overdue:${placementId}:${finalDueAt.toISOString().slice(0, 10)}`,
        title: 'Final assessment overdue',
        message: `${learnerName} has not completed the final competency assessment due on ${finalDueAt.toLocaleDateString()}.`,
        link: '/assessments',
      });
    }
  });

  return signals;
};

const INSTITUTION_NOTIFICATION_ROLES = ['Admin', 'Manager', 'Staff'];

const ensureInstitutionExceptionNotifications = async (user) => {
  if (!INSTITUTION_NOTIFICATION_ROLES.includes(user.role) || !user.institution) {
    return;
  }

  const exceptionData = await getPlacementExceptionData(user.institution);
  const signals = getPlacementExceptionSignals(exceptionData);

  for (const signal of signals) {
    await notifyUsers({
      institution: user.institution,
      roles: INSTITUTION_NOTIFICATION_ROLES,
      type: signal.type.startsWith('assessment') ? 'assessment' : signal.type === 'monitoringOverdue' ? 'visit' : signal.type === 'attendanceOverdue' ? 'report' : 'placement',
      title: signal.title,
      message: signal.message,
      link: signal.link,
      dedupeKey: signal.dedupeKey,
    });
  }
};

const ensurePartnerEvaluationNotifications = async (user) => {
  if (user.role !== 'IndustryPartner') {
    return;
  }

  const partnerId = getPartnerId(user);
  if (!partnerId) {
    return;
  }

  const placements = await Placement.find({ partner: partnerId, status: 'Active' })
    .populate('learner', 'name')
    .populate('partnerSupervisor', 'name')
    .select('_id learner endDate partnerSupervisor')
    .lean();

  if (placements.length === 0) {
    return;
  }

  const learnerIds = placements.map((placement) => placement.learner?._id).filter(Boolean);
  const evaluations = await EmployerEvaluation.find({ partner: partnerId, learner: { $in: learnerIds } })
    .select('learner')
    .lean();
  const evaluatedLearners = new Set(evaluations.map((evaluation) => evaluation.learner.toString()));
  const now = Date.now();

  for (const placement of placements) {
    if (placement.partnerSupervisor && placement.partnerSupervisor._id?.toString() !== user._id.toString()) {
      continue;
    }

    if (!placement.learner?._id || evaluatedLearners.has(placement.learner._id.toString()) || !placement.endDate) {
      continue;
    }

    const daysUntilEnd = Math.ceil((new Date(placement.endDate).getTime() - now) / (1000 * 60 * 60 * 24));
    if (daysUntilEnd > 14) {
      continue;
    }

    await notifyUsers({
      recipientIds: [user._id.toString()],
      type: 'partner',
      title: 'Employer evaluation due soon',
      message: `${placement.learner.name}'s placement ends in ${Math.max(daysUntilEnd, 0)} day(s). Submit the employer evaluation before closeout.`,
      link: '/partner-dashboard?view=mine',
      dedupeKey: `partner-evaluation-due:${placement._id}:${Math.max(daysUntilEnd, 0)}`,
    });
  }
};

const buildLearnerReadiness = (learner, documents = []) => {
  const missingFields = [];

  if (!learner.phone?.trim()) missingFields.push('phone');
  if (!learner.program?.trim()) missingFields.push('program');
  if (!learner.year?.trim()) missingFields.push('year');

  return {
    isReadyForPlacement: missingFields.length === 0,
    missingFields,
    missingDocuments: [],
    documentCount: documents.length,
  };
};

const buildPlacementOperationalReadiness = (placement) => {
  const missingFields = [];
  if (!placement.supervisorName?.trim()) missingFields.push('supervisorName');
  if (!placement.supervisorPhone?.trim() && !placement.supervisorEmail?.trim()) missingFields.push('supervisorContact');

  return {
    isOperational: missingFields.length === 0,
    missingFields,
  };
};

const withCohortRiskMeta = (cohort) => {
  const totalLearners = cohort.totalLearners || 0;
  const placementRate = totalLearners > 0 ? Math.round((((cohort.placed || 0) + (cohort.completed || 0)) / totalLearners) * 100) : 0;
  const dropRate = totalLearners > 0 ? Math.round(((cohort.dropped || 0) / totalLearners) * 100) : 0;
  const riskReasons = [];

  if (placementRate < 40) riskReasons.push('Low placement conversion');
  else if (placementRate < 60) riskReasons.push('Placement conversion below target');

  if (dropRate >= 20) riskReasons.push('High dropout rate');
  else if (dropRate >= 10) riskReasons.push('Dropout rate rising');

  if ((cohort.graduating || 0) > Math.max((cohort.graduated || 0) * 2, 5)) {
    riskReasons.push('Large graduating cohort not yet exiting');
  }

  const riskLevel = riskReasons.some((reason) => ['Low placement conversion', 'High dropout rate'].includes(reason))
    ? 'high'
    : riskReasons.length > 0
      ? 'medium'
      : 'low';

  return {
    ...cohort,
    placementRate,
    dropRate,
    riskLevel,
    riskReasons,
  };
};

// ---- Placement Health Scoring (5 dimensions × 20 pts = 100) ----
const calculatePlacementHealth = (placement, { attendanceLogs, visits, assessments, openTicketCount }) => {
  const dims = {};

  // 1. Contact Completeness (20 pts)
  const contactFields = [
    { key: 'supervisorName', label: 'Supervisor name', present: !!placement.supervisorName?.trim() },
    { key: 'supervisorPhone', label: 'Supervisor phone', present: !!placement.supervisorPhone?.trim() },
    { key: 'supervisorEmail', label: 'Supervisor email', present: !!placement.supervisorEmail?.trim() },
    { key: 'location', label: 'Location', present: !!placement.location?.trim() },
    { key: 'coordinates', label: 'GPS coordinates', present: !!(placement.coordinates?.lat && placement.coordinates?.lng) },
  ];
  const filledCount = contactFields.filter(f => f.present).length;
  const missingContact = contactFields.filter(f => !f.present).map(f => f.label);
  dims.contactCompleteness = {
    score: Math.round((filledCount / contactFields.length) * 20),
    max: 20,
    details: missingContact.length > 0 ? [`Missing: ${missingContact.join(', ')}`] : ['All contact fields complete'],
  };

  // 2. Attendance Freshness (20 pts)
  const now = new Date();
  if (attendanceLogs.length > 0) {
    const latest = attendanceLogs.reduce((max, l) => (new Date(l.periodEnd) > new Date(max.periodEnd) ? l : max), attendanceLogs[0]);
    const daysSince = Math.floor((now - new Date(latest.periodEnd)) / (1000 * 60 * 60 * 24));
    if (daysSince <= 7) {
      dims.attendanceFreshness = { score: 20, max: 20, details: [`Last entry ${daysSince}d ago`] };
    } else if (daysSince <= 14) {
      dims.attendanceFreshness = { score: 10, max: 20, details: [`Last entry ${daysSince}d ago (stale)`] };
    } else {
      dims.attendanceFreshness = { score: 0, max: 20, details: [`Last entry ${daysSince}d ago (very stale)`] };
    }
  } else {
    dims.attendanceFreshness = { score: 0, max: 20, details: ['No attendance logs'] };
  }

  // 3. Visit Coverage (20 pts)
  if (visits.length >= 2) {
    dims.visitCoverage = { score: 20, max: 20, details: [`${visits.length} visits logged`] };
  } else if (visits.length === 1) {
    dims.visitCoverage = { score: 10, max: 20, details: ['1 visit logged (need ≥2)'] };
  } else {
    dims.visitCoverage = { score: 0, max: 20, details: ['No monitoring visits'] };
  }

  // 4. Assessment Completion (20 pts)
  if (assessments.length >= 1) {
    dims.assessmentCompletion = { score: 20, max: 20, details: [`${assessments.length} assessment(s)`] };
  } else {
    dims.assessmentCompletion = { score: 0, max: 20, details: ['No competency assessments'] };
  }

  // 5. Support / Escalation (20 pts — full marks if no open tickets)
  if (openTicketCount === 0) {
    dims.supportEscalation = { score: 20, max: 20, details: ['No open support tickets'] };
  } else {
    dims.supportEscalation = { score: 0, max: 20, details: [`${openTicketCount} open support ticket(s)`] };
  }

  const totalScore = Object.values(dims).reduce((sum, d) => sum + d.score, 0);
  let grade = 'F';
  if (totalScore >= 80) grade = 'A';
  else if (totalScore >= 60) grade = 'B';
  else if (totalScore >= 40) grade = 'C';
  else if (totalScore >= 20) grade = 'D';

  return { score: totalScore, grade, dimensions: dims };
};


const assertLearnersReadyForPlacement = async (learnerIds, institution) => {
  const learners = await Learner.find({ _id: { $in: learnerIds }, institution });
  if (learners.length !== learnerIds.length) {
    return { ok: false, message: 'One or more learners were not found for your institution' };
  }

  const documents = await Document.find({ learner: { $in: learnerIds }, institution }).select('learner category');
  const documentsByLearner = new Map();
  documents.forEach((doc) => {
    const key = doc.learner?.toString();
    if (!documentsByLearner.has(key)) documentsByLearner.set(key, []);
    documentsByLearner.get(key).push(doc);
  });

  const blocked = learners
    .map((learner) => ({
      learner,
      readiness: buildLearnerReadiness(learner, documentsByLearner.get(learner._id.toString()) || []),
    }))
    .filter((entry) => !entry.readiness.isReadyForPlacement);

  if (blocked.length > 0) {
    return {
      ok: false,
      message: blocked.map((entry) => `${entry.learner.name}: missing ${entry.readiness.missingFields.join(', ')}`).join('; '),
    };
  }

  return { ok: true, learners };
};

// ==================== NOTIFICATIONS ====================

router.get('/notifications', async (req, res) => {
    try {
        await ensureInstitutionExceptionNotifications(req.user);
        await ensurePartnerEvaluationNotifications(req.user);

        const notifications = await Notification.find({ recipient: req.user._id, visibleInApp: { $ne: false } })
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('sender', 'name role profilePicture');
        
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

router.put('/notifications/read-all', async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user._id, read: false, visibleInApp: { $ne: false } },
            { $set: { read: true } }
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating notifications' });
    }
});

router.put('/notifications/:id/read', async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user._id, visibleInApp: { $ne: false } },
            { $set: { read: true } },
            { new: true }
        );
        if (!notification) return res.status(404).json({ message: 'Notification not found' });
        res.json(notification);
    } catch (error) {
        res.status(500).json({ message: 'Error updating notification' });
    }
});

router.get('/ownership/users', async (req, res) => {
    try {
        const users = await getOperationalOwnerCandidates(req.user);
        res.json(users);
    } catch (error) {
        console.error('Error fetching operational owner candidates:', error);
        res.status(500).json({ message: 'Error fetching owner candidates' });
    }
});

// ==================== SETTINGS ====================

router.get('/settings/notifications', async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('notificationPreferences');
        res.json(user?.notificationPreferences || {});
    } catch (error) {
        console.error('Error fetching notification preferences:', error);
        res.status(500).json({ message: 'Error fetching notification preferences' });
    }
});

router.get('/settings/notifications/whatsapp-status', async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('phone notificationPreferences');
        res.json({
            configured: canSendWhatsApp(),
            phoneNumberPresent: Boolean(user?.phone?.trim()),
            optedIn: Boolean(user?.notificationPreferences?.whatsApp),
            phoneNumber: user?.phone || '',
        });
    } catch (error) {
        console.error('Error fetching WhatsApp status:', error);
        res.status(500).json({ message: 'Error fetching WhatsApp status' });
    }
});

router.put('/settings/notifications', async (req, res) => {
    try {
        const allowedKeys = [
            'inApp',
            'email',
            'whatsApp',
            'systemUpdates',
            'placementUpdates',
            'supportUpdates',
            'visitUpdates',
            'assessmentUpdates',
            'reportReminders',
            'partnerUpdates',
        ];

        const nextPreferences = allowedKeys.reduce((acc, key) => {
            if (typeof req.body[key] === 'boolean') {
                acc[`notificationPreferences.${key}`] = req.body[key];
            }
            return acc;
        }, {});

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $set: nextPreferences },
            { returnDocument: 'after' }
        ).select('notificationPreferences');

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'UserSettings',
            entityId: req.user._id,
            summary: `Updated notification preferences for ${req.user.name}`,
            metadata: { notificationPreferences: updatedUser?.notificationPreferences || {} },
            changedFields: Object.keys(nextPreferences).map((key) => key.replace('notificationPreferences.', '')),
        });

        res.json(updatedUser?.notificationPreferences || {});
    } catch (error) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({ message: 'Error updating notification preferences' });
    }
});

router.post('/settings/notifications/test-whatsapp', async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('name phone notificationPreferences');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!canSendWhatsApp()) {
            return res.status(400).json({ message: 'WhatsApp provider is not configured on the server' });
        }

        if (!user.phone?.trim()) {
            return res.status(400).json({ message: 'Add a phone number to your account before sending a WhatsApp test' });
        }

        if (!user.notificationPreferences?.whatsApp) {
            return res.status(400).json({ message: 'Enable WhatsApp notifications in your preferences before sending a test' });
        }

        const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
        const delivery = await sendWhatsAppMessage({
            to: user.phone,
            body: `GTVET WhatsApp test\n\nHello ${user.name}, WhatsApp notifications are now connected to your account.\n\nOpen dashboard: ${frontendBase}/notifications`,
        });

        if (!delivery.ok) {
            return res.status(400).json({ message: delivery.error || 'Failed to send WhatsApp test message' });
        }

        await Notification.create({
            recipient: user._id,
            sender: req.user._id,
            type: 'system',
            title: 'WhatsApp test sent',
            message: 'A WhatsApp test message was sent to your account phone number.',
            visibleInApp: true,
            deliveryChannels: ['inApp', 'whatsApp'],
            whatsAppStatus: 'sent',
            whatsAppSentAt: new Date(),
            link: '/settings',
        });

        res.json({ message: 'WhatsApp test message sent successfully' });
    } catch (error) {
        console.error('Error sending WhatsApp test message:', error);
        res.status(500).json({ message: 'Error sending WhatsApp test message' });
    }
});

router.get('/settings/system', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const settings = await getOrCreateSystemSettings();
        res.json(settings);
    } catch (error) {
        console.error('Error fetching system settings:', error);
        res.status(500).json({ message: 'Error fetching system settings' });
    }
});

router.put('/settings/system', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const settings = await getOrCreateSystemSettings();
        const before = settings.toObject();

        settings.organizationName = req.body.organizationName?.trim?.() || settings.organizationName;
        settings.supportEmail = req.body.supportEmail ?? settings.supportEmail;
        settings.supportPhone = req.body.supportPhone ?? settings.supportPhone;
        settings.defaultPlacementDurationWeeks = Number(req.body.defaultPlacementDurationWeeks) || settings.defaultPlacementDurationWeeks;
        settings.attendanceCadenceDays = Number(req.body.attendanceCadenceDays) || settings.attendanceCadenceDays;
        settings.monitoringVisitCadenceDays = Number(req.body.monitoringVisitCadenceDays) || settings.monitoringVisitCadenceDays;
        settings.midpointAssessmentOffsetDays = Number(req.body.midpointAssessmentOffsetDays) || settings.midpointAssessmentOffsetDays;
        settings.finalAssessmentOffsetDays = Number.isFinite(Number(req.body.finalAssessmentOffsetDays)) ? Number(req.body.finalAssessmentOffsetDays) : settings.finalAssessmentOffsetDays;
        settings.employerEvaluationOffsetDays = Number.isFinite(Number(req.body.employerEvaluationOffsetDays)) ? Number(req.body.employerEvaluationOffsetDays) : settings.employerEvaluationOffsetDays;
        settings.maintenanceMode = typeof req.body.maintenanceMode === 'boolean' ? req.body.maintenanceMode : settings.maintenanceMode;
        settings.allowPlacementMessaging = typeof req.body.allowPlacementMessaging === 'boolean' ? req.body.allowPlacementMessaging : settings.allowPlacementMessaging;
        settings.enablePartnerSelfService = typeof req.body.enablePartnerSelfService === 'boolean' ? req.body.enablePartnerSelfService : settings.enablePartnerSelfService;
        settings.defaultAcademicYear = req.body.defaultAcademicYear ?? settings.defaultAcademicYear;
        settings.timezone = req.body.timezone ?? settings.timezone;
        settings.updatedBy = req.user._id;
        await settings.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'SystemSetting',
            entityId: settings._id,
            summary: `Updated system settings`,
            before,
            after: settings,
        });

        res.json(settings);
    } catch (error) {
        console.error('Error updating system settings:', error);
        res.status(500).json({ message: 'Error updating system settings' });
    }
});

// ==================== SUPPORT CENTER ====================

router.get('/support-tickets', async (req, res) => {
    try {
        const scope = await getSupportTicketScope(req.user);
        const { status, category, learnerId, placementId } = req.query;
        const query = { ...scope };

        if (status) query.status = status;
        if (category) query.category = category;
        if (learnerId) query.learner = learnerId;
        if (placementId) query.placement = placementId;

        const tickets = await SupportTicket.find(query)
            .populate('requester', 'name email role institution')
            .populate('learner', 'name trackingId')
            .populate('placement', 'companyName status')
            .populate('assignedTo', 'name email role institution')
            .populate('escalatedTo', 'name email role institution')
            .populate('replies.createdBy', 'name role')
            .sort({ updatedAt: -1, createdAt: -1 });

        const ticketIds = tickets.map((ticket) => ticket._id);
        const documents = await Document.find({ supportTicket: { $in: ticketIds } })
            .populate('uploadedBy', 'name')
            .sort({ createdAt: -1 })
            .lean();
        const docsByTicket = new Map();
        documents.forEach((doc) => {
            const key = doc.supportTicket?.toString();
            if (!key) return;
            if (!docsByTicket.has(key)) docsByTicket.set(key, []);
            docsByTicket.get(key).push(doc);
        });

        res.json(tickets.map((ticket) => ({
            ...withSupportTicketViewerMeta(ticket, req.user),
            documents: docsByTicket.get(ticket._id.toString()) || [],
        })));
    } catch (error) {
        console.error('Error fetching support tickets:', error);
        res.status(500).json({ message: 'Error fetching support tickets' });
    }
});

router.put('/support-tickets/:id/read', async (req, res) => {
    try {
        const scope = await getSupportTicketScope(req.user);
        const ticket = await SupportTicket.findOne({ _id: req.params.id, ...scope });
        if (!ticket) {
            return res.status(404).json({ message: 'Support ticket not found or unauthorized' });
        }

        markSupportTicketReadForUser(ticket, req.user._id);
        await ticket.save();

        const populated = await SupportTicket.findById(ticket._id)
            .populate('requester', 'name email role institution')
            .populate('learner', 'name trackingId')
            .populate('placement', 'companyName status')
            .populate('assignedTo', 'name email role institution')
            .populate('escalatedTo', 'name email role institution')
            .populate('replies.createdBy', 'name role');

        res.json(withSupportTicketViewerMeta(populated, req.user));
    } catch (error) {
        console.error('Error marking support ticket as read:', error);
        res.status(500).json({ message: 'Error updating support ticket read state' });
    }
});

router.get('/support-tickets/assignees', async (req, res) => {
    try {
        if (!canManageSupportAssignments(req.user)) {
            return res.status(403).json({ message: 'You do not have permission to manage assignments' });
        }

        const visibleUsers = await getVisibleSupportAssignees(req.user);

        res.json(visibleUsers);
    } catch (error) {
        console.error('Error fetching support assignees:', error);
        res.status(500).json({ message: 'Error fetching support assignees' });
    }
});

router.get('/access-approvals', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const scope = await getAccessApprovalScope(req.user);
        const query = { ...scope };
        if (req.query.status) {
            query.status = req.query.status;
        }
        if (req.query.implemented === 'true') {
            query.implementedAt = { $ne: null };
        } else if (req.query.implemented === 'false') {
            query.implementedAt = null;
        }

        const approvals = await AccessApproval.find(query)
            .populate('requester', 'name email role institution region')
            .populate('targetUser', 'name email role institution region')
            .populate('decisionBy', 'name email role')
            .populate('implementedBy', 'name email role')
            .populate('implementedUser', 'name email role institution region')
            .sort({ createdAt: -1 })
            .lean();

        res.json(approvals);
    } catch (error) {
        console.error('Error fetching access approvals:', error);
        res.status(500).json({ message: 'Error fetching access approvals' });
    }
});

router.post('/access-approvals', requireRole('Admin', 'RegionalAdmin'), async (req, res) => {
    try {
        const {
            subject,
            description,
            priority = 'Medium',
            requestType = 'Other',
            targetUserId,
            requestedRole = '',
            requestedInstitution = '',
            requestedRegion = '',
        } = req.body;

        if (!subject?.trim() || !description?.trim()) {
            return res.status(400).json({ message: 'Subject and description are required' });
        }

        let institution = req.user.institution || 'N/A';
        let region = req.user.region || '';

        if (req.user.role === 'RegionalAdmin') {
            if (requestedInstitution) {
                const institutionRecord = await Institution.findOne({ name: requestedInstitution }).select('name region');
                if (!institutionRecord) {
                    return res.status(404).json({ message: 'Requested institution not found' });
                }
                if (institutionRecord.region !== req.user.region) {
                    return res.status(403).json({ message: 'Regional admins can only request changes within their own region' });
                }
                institution = institutionRecord.name;
                region = institutionRecord.region;
            } else {
                region = req.user.region || '';
            }
        }

        let targetUser = null;
        if (targetUserId) {
            targetUser = await User.findById(targetUserId).select('_id institution region');
            if (!targetUser) {
                return res.status(404).json({ message: 'Target user not found' });
            }

            if (req.user.role === 'Admin' && targetUser.institution !== req.user.institution) {
                return res.status(403).json({ message: 'You can only escalate access requests for users in your institution' });
            }

            if (req.user.role === 'RegionalAdmin') {
                const targetRegion = targetUser.region || (targetUser.institution ? (await Institution.findOne({ name: targetUser.institution }).select('region'))?.region : '');
                if (targetRegion && targetRegion !== req.user.region) {
                    return res.status(403).json({ message: 'You can only escalate access requests for users in your region' });
                }
            }

            institution = targetUser.institution || institution;
        }

        if (!region && institution && institution !== 'N/A') {
            const institutionRecord = await Institution.findOne({ name: institution }).select('region');
            if (institutionRecord?.region) {
                region = institutionRecord.region;
            }
        }

        const approval = await AccessApproval.create({
            subject: subject.trim(),
            description: description.trim(),
            priority,
            requestType,
            requester: req.user._id,
            requesterRole: req.user.role,
            targetUser: targetUser?._id,
            institution,
            region,
            requestedRole,
            requestedInstitution: requestedInstitution || institution,
            requestedRegion: requestedRegion || region,
        });

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'AccessApproval',
            entityId: approval._id,
            summary: `Created access approval request "${approval.subject}"`,
            after: approval,
        });

        await notifyUsers({
            roles: ['SuperAdmin'],
            sender: req.user._id,
            type: 'system',
            title: 'New access approval request',
            message: `${req.user.name} submitted an access governance request: ${approval.subject}.`,
            link: '/users?governance=pending-approvals',
        });

        const populated = await AccessApproval.findById(approval._id)
            .populate('requester', 'name email role institution region')
            .populate('targetUser', 'name email role institution region')
            .populate('decisionBy', 'name email role')
            .populate('implementedBy', 'name email role')
            .populate('implementedUser', 'name email role institution region')
            .lean();

        res.status(201).json(populated);
    } catch (error) {
        console.error('Error creating access approval:', error);
        res.status(500).json({ message: 'Error creating access approval' });
    }
});

router.put('/access-approvals/:id/decision', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const { decision, comment = '' } = req.body;
        if (!['Approved', 'Rejected'].includes(decision)) {
            return res.status(400).json({ message: 'Decision must be Approved or Rejected' });
        }

        const approval = await AccessApproval.findById(req.params.id);
        if (!approval) {
            return res.status(404).json({ message: 'Access approval not found' });
        }

        if (approval.status !== 'Pending') {
            return res.status(400).json({ message: 'This access approval has already been decided' });
        }

        const before = approval.toObject();
        approval.status = decision;
        approval.decisionComment = comment;
        approval.decisionBy = req.user._id;
        approval.decidedAt = new Date();
        await approval.save();

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'AccessApproval',
            entityId: approval._id,
            summary: `${decision} access approval "${approval.subject}"`,
            before,
            after: approval,
            changedFields: ['status', 'decisionComment', 'decisionBy', 'decidedAt'],
        });

        await notifyUsers({
            recipientIds: [approval.requester],
            sender: req.user._id,
            type: 'system',
            title: `Access approval ${decision.toLowerCase()}`,
            message: `Your access governance request "${approval.subject}" was ${decision.toLowerCase()}.`,
            link: '/users',
        });

        const populated = await AccessApproval.findById(approval._id)
            .populate('requester', 'name email role institution region')
            .populate('targetUser', 'name email role institution region')
            .populate('decisionBy', 'name email role')
            .populate('implementedBy', 'name email role')
            .populate('implementedUser', 'name email role institution region')
            .lean();

        res.json(populated);
    } catch (error) {
        console.error('Error deciding access approval:', error);
        res.status(500).json({ message: 'Error deciding access approval' });
    }
});

router.put('/access-approvals/:id/implement', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const { implementedUserId } = req.body;
        const approval = await AccessApproval.findById(req.params.id);
        if (!approval) {
            return res.status(404).json({ message: 'Access approval not found' });
        }

        if (approval.status !== 'Approved') {
            return res.status(400).json({ message: 'Only approved access requests can be marked as implemented' });
        }

        const before = approval.toObject();
        approval.implementedBy = req.user._id;
        approval.implementedAt = new Date();
        if (implementedUserId) {
            approval.implementedUser = implementedUserId;
        }
        await approval.save();

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'AccessApproval',
            entityId: approval._id,
            summary: `Marked access approval "${approval.subject}" as implemented`,
            before,
            after: approval,
            changedFields: ['implementedBy', 'implementedAt', 'implementedUser'],
        });

        await notifyUsers({
            recipientIds: [approval.requester],
            sender: req.user._id,
            type: 'system',
            title: 'Access request implemented',
            message: `Your approved access request "${approval.subject}" has now been implemented.`,
            link: '/users',
        });

        const populated = await AccessApproval.findById(approval._id)
            .populate('requester', 'name email role institution region')
            .populate('targetUser', 'name email role institution region')
            .populate('decisionBy', 'name email role')
            .populate('implementedBy', 'name email role')
            .populate('implementedUser', 'name email role institution region')
            .lean();

        res.json(populated);
    } catch (error) {
        console.error('Error marking access approval as implemented:', error);
        res.status(500).json({ message: 'Error marking access approval as implemented' });
    }
});

router.post('/support-tickets', async (req, res) => {
    try {
        const {
            subject,
            category,
            priority,
            description,
            learnerId,
            placementId,
            ticketType = 'Support',
            incidentType,
            incidentDate,
        } = req.body;

        let placement = null;
        let learner = null;
        let institution = req.user.institution || 'N/A';
        let region = req.user.region || '';
        const partnerId = getPartnerId(req.user) || undefined;

        if (placementId) {
            placement = await Placement.findById(placementId).select('learner institution partner owner partnerSupervisor');
            if (!placement) {
                return res.status(404).json({ message: 'Placement not found' });
            }

            if (req.user.role === 'IndustryPartner' && placement.partner?.toString() !== partnerId?.toString()) {
                return res.status(403).json({ message: 'You do not have access to this placement' });
            }

            if (req.user.role === 'IndustryPartner' && !canActOnPartnerPlacement(req.user, placement)) {
                return res.status(403).json({ message: 'This placement is assigned to another supervisor' });
            }

            institution = placement.institution || institution;
        }

        if (learnerId) {
            learner = await Learner.findById(learnerId).select('institution region placement');
            if (!learner) {
                return res.status(404).json({ message: 'Learner not found' });
            }

            if (req.user.role === 'Guardian') {
                const linkedLearnerIds = await getGuardianLearnerIds(req.user);
                if (!linkedLearnerIds.includes(learner._id.toString())) {
                    return res.status(403).json({ message: 'You do not have access to this learner' });
                }
            } else if (req.user.role !== 'SuperAdmin' && req.user.role !== 'IndustryPartner' && learner.institution !== req.user.institution) {
                return res.status(403).json({ message: 'You do not have access to this learner' });
            }

            institution = learner.institution || institution;
            region = learner.region || region;
        }

        if (!region && institution && institution !== 'N/A') {
            const institutionRecord = await Institution.findOne({ name: institution }).select('region');
            if (institutionRecord?.region) {
                region = institutionRecord.region;
            }
        }

        if (ticketType === 'Incident' && !incidentType) {
            return res.status(400).json({ message: 'Incident type is required for incident reports' });
        }

        const normalizedSubject = ticketType === 'Incident' && !subject
            ? `${incidentType || 'Incident'} reported`
            : subject;

        const ticket = await SupportTicket.create({
            subject: normalizedSubject,
            ticketType,
            category,
            priority,
            description,
            incidentType: ticketType === 'Incident' ? incidentType : undefined,
            incidentDate: ticketType === 'Incident' ? (incidentDate || new Date()) : undefined,
            requester: req.user._id,
            learner: learnerId || undefined,
            placement: placementId || undefined,
            institution,
            region,
            partnerId,
            requesterRole: req.user.role,
            awaitingParty: getRequesterAwaitingParty(req.user.role),
            firstResponseDueAt: new Date(Date.now() + getSlaTargets(priority).firstResponseHours * 60 * 60 * 1000),
            resolutionDueAt: new Date(Date.now() + getSlaTargets(priority).resolutionHours * 60 * 60 * 1000),
            lastActivityBy: req.user._id,
            lastActivityAt: new Date(),
            readStates: [{ user: req.user._id, lastReadAt: new Date() }],
        });

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'SupportTicket',
            entityId: ticket._id,
            summary: ticketType === 'Incident'
                ? `Created incident report "${ticket.subject}"`
                : `Created support ticket "${ticket.subject}"`,
            after: ticket,
        });

        if (req.user.role !== 'SuperAdmin') {
            const recipientIds = [];
            if (placement?.owner) recipientIds.push(placement.owner);

            const notificationPayload = {
                sender: req.user._id,
                type: 'support',
                title: ticketType === 'Incident' ? 'New placement incident' : 'New support ticket',
                message: ticketType === 'Incident'
                    ? `${req.user.name} reported a ${incidentType} incident${institution && institution !== 'N/A' ? ` for ${institution}` : ''}: ${ticket.subject}.`
                    : `${req.user.name} submitted a ${priority.toLowerCase()} priority support request: ${ticket.subject}.`,
                link: req.user.role === 'Guardian' ? '/guardian-dashboard' : `/support-center?ticket=${ticket._id}`,
            };

            await notifyUsers({
                roles: ['SuperAdmin'],
                ...notificationPayload,
            });

            if (ticketType === 'Incident' || req.user.role === 'Guardian') {
                await notifyUsers({
                    recipientIds,
                    roles: ['Admin', 'Manager'],
                    institution: institution !== 'N/A' ? institution : null,
                    ...notificationPayload,
                });
            }
        }

        const populated = await SupportTicket.findById(ticket._id)
            .populate('requester', 'name email role institution')
            .populate('learner', 'name trackingId')
            .populate('placement', 'companyName status')
            .populate('assignedTo', 'name email role institution')
            .populate('escalatedTo', 'name email role institution')
            .populate('replies.createdBy', 'name role');

        res.status(201).json(withSupportTicketViewerMeta(populated, req.user));
    } catch (error) {
        console.error('Error creating support ticket:', error);
        res.status(500).json({ message: 'Error creating support ticket' });
    }
});

router.post('/support-tickets/:id/replies', async (req, res) => {
    try {
        const scope = await getSupportTicketScope(req.user);
        const ticket = await SupportTicket.findOne({ _id: req.params.id, ...scope });
        if (!ticket) {
            return res.status(404).json({ message: 'Support ticket not found or unauthorized' });
        }

        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ message: 'Reply message is required' });
        }

        ticket.replies.push({
            message: message.trim(),
            createdBy: req.user._id,
            createdByName: req.user.name,
            createdByRole: req.user.role,
        });
        if (!ticket.firstRespondedAt && ticket.requester?.toString() !== req.user._id.toString()) {
            ticket.firstRespondedAt = new Date();
        }
        ticket.awaitingParty = getReplyAwaitingParty(req.user.role);
        ticket.lastActivityBy = req.user._id;
        ticket.lastActivityAt = new Date();
        markSupportTicketReadForUser(ticket, req.user._id);
        await ticket.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'SupportTicket',
            entityId: ticket._id,
            summary: `Added a reply to support ticket "${ticket.subject}"`,
            metadata: { replyMessage: message.trim() },
            changedFields: ['replies'],
        });

        const notifyRecipientIds = [];
        if (ticket.requester.toString() !== req.user._id.toString()) {
            notifyRecipientIds.push(ticket.requester.toString());
        }

        if (notifyRecipientIds.length > 0) {
            await notifyUsers({
                recipientIds: notifyRecipientIds,
                sender: req.user._id,
                type: 'support',
                title: 'Support ticket updated',
                message: `${req.user.name} replied to your support ticket: ${ticket.subject}.`,
                link: `/support-center?ticket=${ticket._id}`,
            });
        }

        const populated = await SupportTicket.findById(ticket._id)
            .populate('requester', 'name email role institution')
            .populate('learner', 'name trackingId')
            .populate('placement', 'companyName status')
            .populate('assignedTo', 'name email role institution')
            .populate('escalatedTo', 'name email role institution')
            .populate('replies.createdBy', 'name role');

        res.json(withSupportTicketViewerMeta(populated, req.user));
    } catch (error) {
        console.error('Error replying to support ticket:', error);
        res.status(500).json({ message: 'Error replying to support ticket' });
    }
});

router.put('/support-tickets/:id/status', async (req, res) => {
    try {
        const scope = await getSupportTicketScope(req.user);
        const ticket = await SupportTicket.findOne({ _id: req.params.id, ...scope });
        if (!ticket) {
            return res.status(404).json({ message: 'Support ticket not found or unauthorized' });
        }

        if (!canManageSupportTicketStatus(req.user, ticket)) {
            return res.status(403).json({ message: 'You do not have permission to change this ticket status' });
        }

        const { status } = req.body;
        const allowedStatuses = ['Open', 'InProgress', 'Resolved', 'Closed'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid support ticket status' });
        }

        const before = ticket.toObject();
        ticket.status = status;
        if (status === 'Resolved' || status === 'Closed') {
            ticket.resolvedAt = new Date();
            ticket.awaitingParty = 'None';
        } else if (status === 'Open' || status === 'InProgress') {
            ticket.resolvedAt = undefined;
            if (ticket.awaitingParty === 'None') {
                ticket.awaitingParty = ticket.requesterRole === 'IndustryPartner' ? 'Support' : 'Partner';
            }
        }
        ticket.lastActivityBy = req.user._id;
        ticket.lastActivityAt = new Date();
        markSupportTicketReadForUser(ticket, req.user._id);
        await ticket.save();

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SupportTicket',
            entityId: ticket._id,
            summary: `Changed support ticket "${ticket.subject}" status to ${status}`,
            before,
            after: ticket,
            changedFields: ['status'],
        });

        if (ticket.requester.toString() !== req.user._id.toString()) {
            await notifyUsers({
                recipientIds: [ticket.requester.toString()],
                sender: req.user._id,
                type: 'support',
                title: 'Support ticket status updated',
                message: `Your ticket "${ticket.subject}" is now marked as ${status}.`,
                link: `/support-center?ticket=${ticket._id}`,
            });
        }

        const populated = await SupportTicket.findById(ticket._id)
            .populate('requester', 'name email role institution')
            .populate('learner', 'name trackingId')
            .populate('placement', 'companyName status')
            .populate('assignedTo', 'name email role institution')
            .populate('escalatedTo', 'name email role institution')
            .populate('replies.createdBy', 'name role');

        res.json(withSupportTicketViewerMeta(populated, req.user));
    } catch (error) {
        console.error('Error updating support ticket status:', error);
        res.status(500).json({ message: 'Error updating support ticket status' });
    }
});

router.put('/support-tickets/:id/assignment', async (req, res) => {
    try {
        if (!canManageSupportAssignments(req.user)) {
            return res.status(403).json({ message: 'You do not have permission to assign tickets' });
        }

        const scope = await getSupportTicketScope(req.user);
        const ticket = await SupportTicket.findOne({ _id: req.params.id, ...scope });
        if (!ticket) {
            return res.status(404).json({ message: 'Support ticket not found or unauthorized' });
        }

        const { assignedTo } = req.body;
        const before = ticket.toObject();
        ticket.assignedTo = assignedTo || undefined;
        if (ticket.status === 'Open' && assignedTo) {
            ticket.status = 'InProgress';
        }
        if (assignedTo) {
            ticket.awaitingParty = 'Support';
        }
        ticket.lastActivityBy = req.user._id;
        ticket.lastActivityAt = new Date();
        markSupportTicketReadForUser(ticket, req.user._id);
        await ticket.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'SupportTicket',
            entityId: ticket._id,
            summary: `Updated support ticket assignment for "${ticket.subject}"`,
            before,
            after: ticket,
            changedFields: ['assignedTo', ...(ticket.status !== before.status ? ['status'] : [])],
        });

        if (assignedTo) {
            await notifyUsers({
                recipientIds: [assignedTo],
                sender: req.user._id,
                type: 'support',
                title: 'Support ticket assigned',
                message: `${req.user.name} assigned you ticket "${ticket.subject}".`,
                link: `/support-center?ticket=${ticket._id}`,
            });
        }

        const populated = await SupportTicket.findById(ticket._id)
            .populate('requester', 'name email role institution')
            .populate('learner', 'name trackingId')
            .populate('placement', 'companyName status')
            .populate('assignedTo', 'name email role institution')
            .populate('escalatedTo', 'name email role institution')
            .populate('replies.createdBy', 'name role');

        res.json(withSupportTicketViewerMeta(populated, req.user));
    } catch (error) {
        console.error('Error updating support ticket assignment:', error);
        res.status(500).json({ message: 'Error updating support ticket assignment' });
    }
});

router.put('/support-tickets/:id/escalation', async (req, res) => {
    try {
        if (!canManageSupportAssignments(req.user)) {
            return res.status(403).json({ message: 'You do not have permission to escalate tickets' });
        }

        const scope = await getSupportTicketScope(req.user);
        const ticket = await SupportTicket.findOne({ _id: req.params.id, ...scope });
        if (!ticket) {
            return res.status(404).json({ message: 'Support ticket not found or unauthorized' });
        }

        const { escalatedTo, escalationLevel, escalationReason } = req.body;
        const before = ticket.toObject();
        ticket.escalatedTo = escalatedTo || undefined;
        ticket.escalationLevel = escalationLevel || 'None';
        ticket.escalationReason = escalationReason?.trim?.() || '';
        ticket.escalatedAt = escalatedTo ? new Date() : undefined;
        if (ticket.status === 'Open') {
            ticket.status = 'InProgress';
        }
        if (escalatedTo) {
            ticket.awaitingParty = 'Support';
        }
        ticket.lastActivityBy = req.user._id;
        ticket.lastActivityAt = new Date();
        markSupportTicketReadForUser(ticket, req.user._id);
        await ticket.save();

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SupportTicket',
            entityId: ticket._id,
            summary: `Escalation updated for support ticket "${ticket.subject}"`,
            before,
            after: ticket,
            changedFields: ['escalatedTo', 'escalationLevel', 'escalationReason', 'escalatedAt'],
        });

        if (escalatedTo) {
            await notifyUsers({
                recipientIds: [escalatedTo],
                sender: req.user._id,
                type: 'support',
                title: 'Support ticket escalated',
                message: `${req.user.name} escalated ticket "${ticket.subject}" to you.`,
                link: `/support-center?ticket=${ticket._id}`,
                dedupeKey: `support-escalation:${ticket._id}:${ticket.escalatedAt ? new Date(ticket.escalatedAt).toISOString() : 'current'}`,
            });
        }

        const populated = await SupportTicket.findById(ticket._id)
            .populate('requester', 'name email role institution')
            .populate('learner', 'name trackingId')
            .populate('placement', 'companyName status')
            .populate('assignedTo', 'name email role institution')
            .populate('escalatedTo', 'name email role institution')
            .populate('replies.createdBy', 'name role');

        res.json(withSupportTicketViewerMeta(populated, req.user));
    } catch (error) {
        console.error('Error escalating support ticket:', error);
        res.status(500).json({ message: 'Error escalating support ticket' });
    }
});

// ==================== AUDIT LOGS ====================

router.get('/audit-logs', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const scope = await getAuditLogScope(req.user);
        const { entityType, action, actorId, entityId, search, dateFrom, dateTo } = req.query;
        const query = { ...scope };

        if (entityType) query.entityType = entityType;
        if (action) query.action = action;
        if (actorId) query.actorId = actorId;
        if (entityId) query.entityId = { $regex: entityId, $options: 'i' };
        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }
        if (search) {
            query.$or = [
                { summary: { $regex: search, $options: 'i' } },
                { actorName: { $regex: search, $options: 'i' } },
                { entityType: { $regex: search, $options: 'i' } },
                { entityId: { $regex: search, $options: 'i' } },
            ];
        }

        const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(300);
        res.json(logs);
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ message: 'Error fetching audit logs' });
    }
});

router.get('/audit-logs/export', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const scope = await getAuditLogScope(req.user);
        const { entityType, action, actorId, entityId, search, dateFrom, dateTo } = req.query;
        const query = { ...scope };

        if (entityType) query.entityType = entityType;
        if (action) query.action = action;
        if (actorId) query.actorId = actorId;
        if (entityId) query.entityId = { $regex: entityId, $options: 'i' };
        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }
        if (search) {
            query.$or = [
                { summary: { $regex: search, $options: 'i' } },
                { actorName: { $regex: search, $options: 'i' } },
                { entityType: { $regex: search, $options: 'i' } },
                { entityId: { $regex: search, $options: 'i' } },
            ];
        }

        const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(1000);
        const rows = logs.map((log) => ({
            Timestamp: new Date(log.createdAt).toISOString(),
            Action: log.action,
            EntityType: log.entityType,
            EntityId: log.entityId,
            Summary: log.summary,
            ActorName: log.actorName,
            ActorRole: log.actorRole,
            Institution: log.institution || 'N/A',
            Route: log.route || '',
            Method: log.method || '',
            ChangedFields: log.changedFields?.join(', ') || '',
        }));

        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(rows);

        res.header('Content-Type', 'text/csv');
        res.attachment(`Audit_Log_Export_${new Date().toISOString().split('T')[0]}.csv`);
        return res.send(csv);
    } catch (error) {
        console.error('Error exporting audit logs:', error);
        res.status(500).json({ message: 'Error exporting audit logs' });
    }
});

router.get('/audit-logs/anomalies', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const scope = await getAuditLogScope(req.user);
        const days = Number(req.query.days) || 30;
        const since = new Date();
        since.setDate(since.getDate() - days);

        const logs = await AuditLog.find({
            ...scope,
            createdAt: { $gte: since },
        }).sort({ createdAt: -1 });

        const deleteCountsByInstitution = new Map();
        const failedAuthByActor = new Map();
        const failedAuthByInstitution = new Map();
        const updateBursts = new Map();
        const riskByInstitution = new Map();

        const addRisk = (institution, amount) => {
            const key = institution || 'N/A';
            riskByInstitution.set(key, (riskByInstitution.get(key) || 0) + amount);
        };

        logs.forEach((log) => {
            const institution = log.institution || 'N/A';
            const dayKey = `${institution}|||${new Date(log.createdAt).toISOString().split('T')[0]}`;

            if (log.action === 'DELETE') {
                deleteCountsByInstitution.set(dayKey, (deleteCountsByInstitution.get(dayKey) || 0) + 1);
                addRisk(institution, 3);
            }

            if (log.action === 'UPDATE' || log.action === 'STATUS_CHANGE') {
                const actorKey = `${log.actorId || log.actorName}|||${institution}`;
                updateBursts.set(actorKey, (updateBursts.get(actorKey) || 0) + 1);
                addRisk(institution, 1);
            }

            if (log.action === 'AUTH' && log.metadata?.outcome === 'FAILED') {
                const actorKey = log.actorId?.toString() || log.metadata?.email || log.actorName;
                failedAuthByActor.set(actorKey, {
                    actorName: log.actorName,
                    institution,
                    count: (failedAuthByActor.get(actorKey)?.count || 0) + 1,
                });
                failedAuthByInstitution.set(institution, (failedAuthByInstitution.get(institution) || 0) + 1);
                addRisk(institution, 2);
            }
        });

        const deleteSpikes = [...deleteCountsByInstitution.entries()]
            .filter(([, count]) => count >= 5)
            .map(([key, count]) => {
                const [institution, date] = key.split('|||');
                return {
                    institution,
                    date,
                    count,
                    severity: count >= 10 ? 'high' : 'medium',
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const failedAuthActors = [...failedAuthByActor.values()]
            .filter((entry) => entry.count >= 3)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const massUpdates = [...updateBursts.entries()]
            .filter(([, count]) => count >= 20)
            .map(([key, count]) => {
                const [actorName, institution] = key.split('|||');
                return {
                    actorName,
                    institution,
                    count,
                    severity: count >= 40 ? 'high' : 'medium',
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const riskyInstitutions = [...riskByInstitution.entries()]
            .map(([institution, score]) => ({
                institution,
                score,
                failedAuths: failedAuthByInstitution.get(institution) || 0,
                deleteSpikes: deleteSpikes.filter((entry) => entry.institution === institution).length,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        res.json({
            windowDays: days,
            deleteSpikes,
            failedAuthActors,
            failedAuthInstitutions: [...failedAuthByInstitution.entries()]
                .map(([institution, count]) => ({ institution, count }))
                .filter((entry) => entry.count >= 3)
                .sort((a, b) => b.count - a.count)
                .slice(0, 10),
            massUpdates,
            riskyInstitutions,
        });
    } catch (error) {
        console.error('Error fetching audit anomalies:', error);
        res.status(500).json({ message: 'Error fetching audit anomalies' });
    }
});

// ==================== MONITORING VISITS ====================

router.get('/monitoring-visits/export', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const visits = await MonitoringVisit.find(filter)
            .populate({
                path: 'learner',
                populate: { path: 'placement' }
            })
            .sort({ visitDate: -1 });

        const mappedData = visits.map(v => ({
            'Learner Name': v.learner?.name || 'Unknown',
            'Tracking ID': v.learner?.trackingId || 'N/A',
            'Institution': v.institution || 'N/A',
            'Visit Date': new Date(v.visitDate).toLocaleDateString(),
            'Visit Type': v.visitType,
            'Attendance': v.attendanceStatus,
            'Performance Rating': `${v.performanceRating}/5`,
            'Issues Identified': v.issuesIdentified || 'None reported',
            'Action Taken': v.actionTaken || 'None',
            'Next Steps': v.nextSteps || 'None'
        }));

        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(mappedData);

        res.header('Content-Type', 'text/csv');
        res.attachment('Monitoring_Visits_Export.csv');
        return res.send(csv);
    } catch (error) {
        console.error("Export Error:", error);
        res.status(500).json({ message: 'Error exporting monitoring visits', error: error.message });
    }
});

router.get('/monitoring-visits', async (req, res) => {
    try {
      const filter = await getFilter(req.user);
      const visits = await MonitoringVisit.find(filter)
        .populate({
            path: 'learner',
            populate: { path: 'placement' }
        });
      res.json(visits);
    } catch (error) {
      res.status(500).json({ message: 'Server Error' });
    }
});

const canMutateMonitoringVisit = (user, visit, action = 'update') => {
    if (!visit) return false;
    if (['SuperAdmin', 'RegionalAdmin', 'Admin'].includes(user.role)) return true;

    const isOwner = visit.submittedBy?.toString() === user._id.toString();
    if (!isOwner) return false;

    const ageMs = Date.now() - new Date(visit.createdAt).getTime();
    const withinEditableWindow = ageMs <= 24 * 60 * 60 * 1000;
    if (!withinEditableWindow) return false;

    if (['Verified', 'ExceptionApproved', 'Rejected'].includes(visit.gpsReviewStatus || '')) {
        return false;
    }

    if (action === 'delete' && visit.locationVerified === 'Verified') {
        return false;
    }

    return true;
};

const determineMonitoringVisitVerification = async ({ learnerId, submittedLocation, gpsExceptionReason = '' }) => {
    let locationVerified = submittedLocation?.lat && submittedLocation?.lng ? 'No Placement' : 'No GPS';
    let distanceFromSite = null;
    let gpsReviewStatus = 'PendingReview';

    if (submittedLocation?.lat && submittedLocation?.lng && learnerId) {
        const placement = await Placement.findOne({
            learner: learnerId,
            status: 'Active',
        }).select('coordinates');

        if (!placement || !placement.coordinates?.lat || !placement.coordinates?.lng) {
            locationVerified = 'No Placement';
        } else {
            distanceFromSite = haversineDistance(
                submittedLocation.lat, submittedLocation.lng,
                placement.coordinates.lat, placement.coordinates.lng
            );
            locationVerified = distanceFromSite <= 500 ? 'Verified' : 'Unverified';
        }
    }

    if (locationVerified === 'Verified') {
        gpsReviewStatus = 'Verified';
    } else if (!gpsExceptionReason?.trim()) {
        return {
            error: 'A GPS exception reason is required when the visit is not GPS verified.',
        };
    }

    return {
        locationVerified,
        distanceFromSite,
        gpsReviewStatus,
        gpsCapturedAt: submittedLocation?.lat && submittedLocation?.lng ? new Date() : undefined,
    };
};

router.post('/monitoring-visits', async (req, res) => {
    try {
        const { submittedLocation, ...visitData } = req.body;
        const learnerRecord = await Learner.findById(visitData.learner).select('institution');
        if (!learnerRecord) {
            return res.status(404).json({ message: 'Learner not found' });
        }

        const verification = await determineMonitoringVisitVerification({
            learnerId: visitData.learner,
            submittedLocation,
            gpsExceptionReason: visitData.gpsExceptionReason,
        });
        if (verification.error) {
            return res.status(400).json({ message: verification.error });
        }

        // Detect if this is a delegated visit
        let delegationFields = {};
        if (req.user.institution !== learnerRecord.institution) {
            const activePlacement = await Placement.findOne({
                learner: visitData.learner,
                delegate: req.user._id,
                status: 'Active',
            }).select('institution owner');

            if (activePlacement) {
                delegationFields = {
                    isDelegatedVisit: true,
                    delegatedFromInstitution: activePlacement.institution,
                    delegatedFromOfficer: activePlacement.owner || undefined,
                };
            }
        }

        const newVisit = new MonitoringVisit({
          ...visitData,
          submittedLocation: submittedLocation || undefined,
          locationVerified: verification.locationVerified,
          distanceFromSite: verification.distanceFromSite,
          gpsReviewStatus: verification.gpsReviewStatus,
          gpsCapturedAt: verification.gpsCapturedAt,
          submittedBy: req.user._id,
          institution: learnerRecord.institution || req.user.institution,
          ...delegationFields,
        });
        await newVisit.save();

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'MonitoringVisit',
            entityId: newVisit._id,
            summary: `Logged monitoring visit for learner ${visitData.learner}${delegationFields.isDelegatedVisit ? ' (delegated visit)' : ''}`,
            after: newVisit,
        });

        if (visitData.industryPartner) {
            notifyUsers({
                partnerId: visitData.industryPartner,
                sender: req.user._id,
                type: 'visit',
                title: 'Monitoring Visit Logged',
                message: `A monitoring visit report was submitted for your organization.`,
                link: '/partner-dashboard?view=mine'
            });
        }

        // Notify the originating officer if this is a delegated visit
        if (delegationFields.isDelegatedVisit && delegationFields.delegatedFromOfficer) {
            notifyUsers({
                recipientIds: [delegationFields.delegatedFromOfficer.toString()],
                sender: req.user._id,
                type: 'visit',
                title: 'Delegate Visit Completed',
                message: `${req.user.name || 'A delegate'} has completed a monitoring visit for your learner at ${learnerRecord.institution}.`,
                link: '/monitoring-visits',
            });
        }

        res.status(201).json(newVisit);
    } catch (error) {
        console.error("Error creating visit:", error);
        res.status(500).json({ message: 'Error creating visit' });
    }
});

// Haversine formula: returns distance in metres between two GPS points
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in metres
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ==================== ANOMALY DETECTION ====================

router.get('/monitoring-visits/anomalies', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentVisits = await MonitoringVisit.find({
            ...filter,
            createdAt: { $gte: thirtyDaysAgo },
        })
            .populate('learner', 'name trackingId')
            .populate('submittedBy', 'name email')
            .sort({ createdAt: -1 });

        const anomalies = [];

        // Group visits by submitter
        const bySubmitter = {};
        for (const v of recentVisits) {
            const key = v.submittedBy?._id?.toString() || 'unknown';
            if (!bySubmitter[key]) bySubmitter[key] = [];
            bySubmitter[key].push(v);
        }

        for (const [, visits] of Object.entries(bySubmitter)) {
            // 1. Bulk submissions: >3 in 30 minutes
            for (let i = 0; i < visits.length; i++) {
                const window = visits.filter(v2 => {
                    const diff = Math.abs(new Date(v2.createdAt) - new Date(visits[i].createdAt));
                    return diff <= 30 * 60 * 1000 && v2._id.toString() !== visits[i]._id.toString();
                });
                if (window.length >= 3) {
                    anomalies.push({
                        type: 'bulk_submission',
                        severity: 'high',
                        message: `${visits[i].submittedBy?.name || 'Unknown'} submitted ${window.length + 1} visits within 30 minutes`,
                        visit: visits[i],
                        date: visits[i].createdAt,
                    });
                    break; // one flag per submitter
                }
            }

            // 2. Off-hours submissions (9PM – 5AM)
            for (const v of visits) {
                const hour = new Date(v.createdAt).getHours();
                if (hour >= 21 || hour < 5) {
                    anomalies.push({
                        type: 'off_hours',
                        severity: 'medium',
                        message: `Visit submitted at ${new Date(v.createdAt).toLocaleTimeString()} (outside working hours)`,
                        visit: v,
                        date: v.createdAt,
                    });
                }
            }

            // 3. Consistently no GPS
            const noGpsCount = visits.filter(v => v.locationVerified === 'No GPS').length;
            if (noGpsCount > 3 && noGpsCount / visits.length >= 0.8) {
                anomalies.push({
                    type: 'no_gps',
                    severity: 'medium',
                    message: `${visits[0].submittedBy?.name || 'Unknown'} has no GPS on ${noGpsCount}/${visits.length} recent visits`,
                    visit: visits[0],
                    date: visits[0].createdAt,
                });
            }
        }

        // 4. All unverified visits (submitted but far from site)
        const unverified = recentVisits
            .filter(v => v.locationVerified === 'Unverified')
            .map(v => ({
                type: 'location_mismatch',
                severity: 'high',
                message: `Visit submitted ${((v.distanceFromSite || 0) / 1000).toFixed(1)}km from placement site`,
                visit: v,
                date: v.createdAt,
            }));

        anomalies.push(...unverified);

        // Sort by date descending
        anomalies.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(anomalies);
    } catch (error) {
        console.error("Error fetching anomalies:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

router.put('/monitoring-visits/:id', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const existingVisit = await MonitoringVisit.findOne({ _id: req.params.id, ...filter });
        if (!existingVisit) {
            return res.status(404).json({ message: 'Visit not found or unauthorized' });
        }
        const { clientUpdatedAt, ...requestBody } = req.body;
        if (!canMutateMonitoringVisit(req.user, existingVisit, 'update')) {
            return res.status(403).json({ message: 'This visit can no longer be edited without administrator review.' });
        }
        if (clientUpdatedAt && existingVisit.updatedAt && new Date(existingVisit.updatedAt) > new Date(clientUpdatedAt)) {
            return res.status(409).json(buildStaleUpdateConflict({
                entityType: 'MonitoringVisit',
                currentRecord: existingVisit.toObject(),
                clientPayload: requestBody,
                clientUpdatedAt,
                fields: ['visitDate', 'visitType', 'attendanceStatus', 'performanceRating', 'keyObservations', 'issuesIdentified', 'actionRequired', 'gpsExceptionReason'],
            }));
        }
        const before = existingVisit.toObject();

        const nextPayload = {
            ...existingVisit.toObject(),
            ...requestBody,
        };
        const verification = await determineMonitoringVisitVerification({
            learnerId: nextPayload.learner,
            submittedLocation: nextPayload.submittedLocation,
            gpsExceptionReason: nextPayload.gpsExceptionReason,
        });
        if (verification.error) {
            return res.status(400).json({ message: verification.error });
        }

        existingVisit.visitDate = nextPayload.visitDate;
        existingVisit.visitorPosition = nextPayload.visitorPosition;
        existingVisit.visitType = nextPayload.visitType;
        existingVisit.attendanceStatus = nextPayload.attendanceStatus;
        existingVisit.performanceRating = nextPayload.performanceRating;
        existingVisit.keyObservations = nextPayload.keyObservations;
        existingVisit.issuesIdentified = nextPayload.issuesIdentified;
        existingVisit.actionRequired = nextPayload.actionRequired;
        existingVisit.gpsExceptionReason = nextPayload.gpsExceptionReason;
        existingVisit.submittedLocation = nextPayload.submittedLocation;
        existingVisit.locationVerified = verification.locationVerified;
        existingVisit.distanceFromSite = verification.distanceFromSite;
        existingVisit.gpsReviewStatus = verification.gpsReviewStatus;
        existingVisit.gpsCapturedAt = verification.gpsCapturedAt || existingVisit.gpsCapturedAt;
        existingVisit.gpsReviewComment = undefined;
        existingVisit.gpsReviewedAt = undefined;
        existingVisit.gpsReviewedBy = undefined;

        await existingVisit.save();

        if (existingVisit) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'MonitoringVisit',
                entityId: existingVisit._id,
                summary: `Updated monitoring visit ${existingVisit._id}`,
                before,
                after: existingVisit,
            });
        }
        res.json(existingVisit);
    } catch (error) {
        console.error('Error updating visit:', error);
        res.status(500).json({ message: 'Error updating visit' });
    }
});

router.put('/monitoring-visits/:id/gps-review', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const visit = await MonitoringVisit.findOne({ _id: req.params.id, ...filter });
        if (!visit) {
            return res.status(404).json({ message: 'Visit not found or unauthorized' });
        }

        const { decision, comment = '' } = req.body;
        if (!['approve_exception', 'reject', 'mark_verified'].includes(decision)) {
            return res.status(400).json({ message: 'Invalid GPS review decision' });
        }

        if (decision === 'approve_exception') {
            const evidenceCount = await Document.countDocuments({ monitoringVisit: visit._id });
            if (!visit.gpsExceptionReason?.trim()) {
                return res.status(400).json({ message: 'A GPS exception reason is required before approving an exception.' });
            }
            if (evidenceCount === 0) {
                return res.status(400).json({ message: 'Upload supporting evidence before approving a GPS exception.' });
            }
            visit.gpsReviewStatus = 'ExceptionApproved';
        } else if (decision === 'reject') {
            if (!comment.trim()) {
                return res.status(400).json({ message: 'A review comment is required when rejecting GPS verification.' });
            }
            visit.gpsReviewStatus = 'Rejected';
        } else {
            if (visit.locationVerified !== 'Verified') {
                return res.status(400).json({ message: 'Only GPS-verified visits can be marked as verified.' });
            }
            visit.gpsReviewStatus = 'Verified';
        }

        visit.gpsReviewComment = comment;
        visit.gpsReviewedAt = new Date();
        visit.gpsReviewedBy = req.user._id;
        await visit.save();

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'MonitoringVisit',
            entityId: visit._id,
            summary: `GPS review updated for monitoring visit ${visit._id}`,
            after: visit,
            changedFields: ['gpsReviewStatus', 'gpsReviewComment', 'gpsReviewedAt', 'gpsReviewedBy'],
        });

        res.json(visit);
    } catch (error) {
        console.error('Error reviewing monitoring visit GPS:', error);
        res.status(500).json({ message: 'Error reviewing monitoring visit GPS' });
    }
});

router.delete('/monitoring-visits/:id', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const visit = await MonitoringVisit.findOne({ _id: req.params.id, ...filter });
        if (!visit) {
            return res.status(404).json({ message: 'Visit not found or unauthorized' });
        }
        if (!canMutateMonitoringVisit(req.user, visit, 'delete')) {
            return res.status(403).json({ message: 'This visit can no longer be deleted without administrator action.' });
        }
        const deletedVisit = await MonitoringVisit.findByIdAndDelete(req.params.id);
        if (deletedVisit) {
            await logAuditEvent({
                req,
                action: 'DELETE',
                entityType: 'MonitoringVisit',
                entityId: deletedVisit._id,
                summary: `Deleted monitoring visit ${deletedVisit._id}`,
                before: deletedVisit,
            });
        }
        res.json({ message: 'Visit deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting visit' });
    }
});

// ==================== DASHBOARD STATS ====================

router.get('/dashboard/stats', async (req, res) => {
  try {
    const filter = await getFilter(req.user);
    const systemSettings = await getOrCreateSystemSettings();

    const totalLearners = await Learner.countDocuments(filter);
    const placedLearners = await Learner.countDocuments({ ...filter, status: { $in: ['Placed', 'Completed'] } });
    const pendingLearners = await Learner.countDocuments({ ...filter, status: 'Pending' });
    const [academicActiveLearners, academicGraduatingLearners, academicGraduatedLearners, academicDroppedLearners] = await Promise.all([
      Learner.countDocuments({ ...filter, academicStatus: 'Active' }),
      Learner.countDocuments({ ...filter, academicStatus: 'Graduating' }),
      Learner.countDocuments({ ...filter, academicStatus: 'Graduated' }),
      Learner.countDocuments({ ...filter, academicStatus: 'Dropped' }),
    ]);
    const totalVisits = await MonitoringVisit.countDocuments(filter);
    const intakeCohorts = await Learner.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $ifNull: ['$intakeAcademicYear', 'Unspecified'] },
          totalLearners: { $sum: 1 },
          currentEnrolled: {
            $sum: {
              $cond: [
                { $in: ['$academicStatus', ['Active', 'Graduating']] },
                1,
                0,
              ],
            },
          },
          graduating: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduating'] }, 1, 0] } },
          graduated: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduated'] }, 1, 0] } },
          dropped: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Dropped'] }, 1, 0] } },
          placed: { $sum: { $cond: [{ $eq: ['$status', 'Placed'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        },
      },
      { $sort: { _id: -1 } },
    ]);
    
    const recentPlacements = await Learner.find({ ...filter, status: 'Placed' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate('placement');

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const learnerTrend = await Learner.aggregate([
        { $match: { ...filter, createdAt: { $gte: sixMonthsAgo } } },
        { $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            total: { $sum: 1 }
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const monthlyStats = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const found = learnerTrend.find(l => l._id.year === year && l._id.month === month);
        monthlyStats.push({
            name: monthNames[month - 1],
            total: found ? found.total : 0
        });
    }

    const activePlacements = await Placement.find({ ...filter, status: 'Active' }).select('_id learner startDate endDate');
    const activePlacementIds = activePlacements.map((placement) => placement._id);
    const activeLearnerIds = activePlacements.map((placement) => placement.learner);

    let institutionPerformance = {
      placementCoverageRate: totalLearners > 0 ? Math.round((placedLearners / totalLearners) * 100) : 0,
      activeLearnerCount: activePlacements.length,
      overdueAttendanceRate: 0,
      monitoringCoverageRate: 0,
      assessmentCompletionRate: 0,
      supportBacklog: 0,
      slaBreachCount: 0,
    };

    if (activePlacements.length > 0) {
      const [attendanceLogs, visits, assessments, supportScope] = await Promise.all([
        AttendanceLog.find({ placement: { $in: activePlacementIds } }).select('placement periodEnd status'),
        MonitoringVisit.find({ learner: { $in: activeLearnerIds } }).select('learner visitDate'),
        CompetencyAssessment.find({ learner: { $in: activeLearnerIds } }).select('learner assessmentDate'),
        getSupportTicketScope(req.user),
      ]);

      const supportTickets = await SupportTicket.find({
        ...supportScope,
        status: { $in: ['Open', 'InProgress'] },
      }).select('firstRespondedAt firstResponseDueAt resolutionDueAt status');

      const latestAttendanceByPlacement = new Map();
      attendanceLogs.forEach((log) => {
        const key = log.placement.toString();
        const current = latestAttendanceByPlacement.get(key);
        if (!current || new Date(log.periodEnd) > new Date(current.periodEnd)) {
          latestAttendanceByPlacement.set(key, log);
        }
      });

      const latestVisitByLearner = new Map();
      visits.forEach((visit) => {
        const key = visit.learner.toString();
        const current = latestVisitByLearner.get(key);
        if (!current || new Date(visit.visitDate) > new Date(current.visitDate)) {
          latestVisitByLearner.set(key, visit);
        }
      });

      const assessmentCountByLearner = new Map();
      assessments.forEach((assessment) => {
        const key = assessment.learner.toString();
        assessmentCountByLearner.set(key, (assessmentCountByLearner.get(key) || 0) + 1);
      });

      const nowTime = Date.now();
      let overdueAttendanceCount = 0;
      let monitoringCoveredCount = 0;
      let assessmentCompleteCount = 0;

      activePlacements.forEach((placement) => {
        const learnerId = placement.learner.toString();
        const latestAttendance = latestAttendanceByPlacement.get(placement._id.toString());
        const latestVisit = latestVisitByLearner.get(learnerId);
        const attendanceDueAt = latestAttendance
          ? new Date(new Date(latestAttendance.periodEnd).getTime() + systemSettings.attendanceCadenceDays * 24 * 60 * 60 * 1000)
          : placement.startDate
            ? new Date(new Date(placement.startDate).getTime() + systemSettings.attendanceCadenceDays * 24 * 60 * 60 * 1000)
            : null;
        const monitoringDueAt = latestVisit
          ? new Date(new Date(latestVisit.visitDate).getTime() + systemSettings.monitoringVisitCadenceDays * 24 * 60 * 60 * 1000)
          : placement.startDate
            ? new Date(new Date(placement.startDate).getTime() + systemSettings.monitoringVisitCadenceDays * 24 * 60 * 60 * 1000)
            : null;

        if (attendanceDueAt && attendanceDueAt.getTime() < nowTime) overdueAttendanceCount += 1;
        if (!monitoringDueAt || monitoringDueAt.getTime() >= nowTime) monitoringCoveredCount += 1;
        if ((assessmentCountByLearner.get(learnerId) || 0) > 0) assessmentCompleteCount += 1;
      });

      institutionPerformance = {
        placementCoverageRate: totalLearners > 0 ? Math.round((placedLearners / totalLearners) * 100) : 0,
        activeLearnerCount: activePlacements.length,
        overdueAttendanceRate: Math.round((overdueAttendanceCount / activePlacements.length) * 100),
        monitoringCoverageRate: Math.round((monitoringCoveredCount / activePlacements.length) * 100),
        assessmentCompletionRate: Math.round((assessmentCompleteCount / activePlacements.length) * 100),
        supportBacklog: supportTickets.length,
        slaBreachCount: supportTickets.filter((ticket) => computeSlaStatus(ticket).hasBreach).length,
      };
    }

    res.json({
      totalLearners,
      placed: placedLearners,
      pending: pendingLearners,
      academicSummary: {
        currentEnrolled: academicActiveLearners + academicGraduatingLearners,
        active: academicActiveLearners,
        graduating: academicGraduatingLearners,
        graduated: academicGraduatedLearners,
        dropped: academicDroppedLearners,
      },
      intakeCohorts: intakeCohorts.map((cohort) => withCohortRiskMeta({
        intakeAcademicYear: cohort._id,
        totalLearners: cohort.totalLearners,
        currentEnrolled: cohort.currentEnrolled,
        graduating: cohort.graduating,
        graduated: cohort.graduated,
        dropped: cohort.dropped,
        placed: cohort.placed,
        completed: cohort.completed,
      })),
      recentPlacements,
      monthlyStats,
      totalVisits,
      institutionPerformance,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error });
  }
});

router.get('/dashboard/action-alerts', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const alerts = [];
        const systemSettings = await getOrCreateSystemSettings();

        // 1. Pending Learners (Needs Placement)
        const pendingLearners = await Learner.find({ ...filter, status: 'Pending' }).select('name trackingId owner');
        pendingLearners.forEach(l => {
            alerts.push({
                type: 'Needs Placement',
                learnerId: l._id,
                learnerName: l.name,
                trackingId: l.trackingId,
                message: 'Learner is registered but not placed in industry.',
                actionUrl: `/placements?learnerId=${l._id}`
            });
        });

        // 2. Active placements missing supervisor completeness
        const placementsNeedingSetup = await Placement.find({
            ...filter,
            status: 'Active',
            $or: [
              { supervisorName: { $in: [null, ''] } },
              {
                $and: [
                  { supervisorPhone: { $in: [null, ''] } },
                  { supervisorEmail: { $in: [null, ''] } },
                ],
              },
            ],
        }).populate('learner', 'name trackingId');

        placementsNeedingSetup.forEach((placement) => {
          if (!placement.learner) return;
          alerts.push({
            type: 'Setup Required',
            learnerId: placement.learner._id,
            learnerName: placement.learner.name,
            trackingId: placement.learner.trackingId,
            message: 'Placement is active but supervisor details are incomplete.',
            actionUrl: `/placements`,
          });
        });

        // 3. Placed learners with no visits by configured cadence
        const recentVisitCutoff = new Date();
        recentVisitCutoff.setDate(recentVisitCutoff.getDate() - systemSettings.monitoringVisitCadenceDays);

        const recentVisits = await MonitoringVisit.find({ visitDate: { $gte: recentVisitCutoff } }).select('learner');
        const recentlyVisitedLearnerIds = recentVisits.map(v => v.learner);

        // Query learners who are "Placed" but their ID is NOT in the recent visits list
        const needsVisitLearners = await Learner.find({
            ...filter,
            status: 'Placed',
            _id: { $nin: recentlyVisitedLearnerIds }
        }).select('name trackingId');

        needsVisitLearners.forEach(l => {
             alerts.push({
                type: 'Needs Visit',
                learnerId: l._id,
                learnerName: l.name,
                trackingId: l.trackingId,
                message: 'No monitoring visit logged in the last 30 days.',
                actionUrl: `/monitoring-visits?learnerId=${l._id}`
            });
        });

        // 4. Attendance overdue by configured cadence
        const activePlacements = await Placement.find({ ...filter, status: 'Active' }).populate('learner', 'name trackingId');
        const placementIds = activePlacements.map((placement) => placement._id);
        const attendanceLogs = await AttendanceLog.find({ placement: { $in: placementIds } }).select('placement periodEnd').sort({ periodEnd: -1 });
        const attendanceByPlacement = new Map();
        attendanceLogs.forEach((log) => {
          const key = log.placement.toString();
          if (!attendanceByPlacement.has(key)) attendanceByPlacement.set(key, log);
        });

        activePlacements.forEach((placement) => {
          const latestAttendance = attendanceByPlacement.get(placement._id.toString());
          const dueAt = latestAttendance
            ? new Date(new Date(latestAttendance.periodEnd).getTime() + systemSettings.attendanceCadenceDays * 24 * 60 * 60 * 1000)
            : placement.startDate
              ? new Date(new Date(placement.startDate).getTime() + systemSettings.attendanceCadenceDays * 24 * 60 * 60 * 1000)
              : null;
          if (dueAt && dueAt < new Date() && placement.learner) {
            alerts.push({
              type: 'Attendance Overdue',
              learnerId: placement.learner._id,
              learnerName: placement.learner.name,
              trackingId: placement.learner.trackingId,
              message: `Attendance is overdue. Expected by ${dueAt.toLocaleDateString()}.`,
              actionUrl: `/attendance-logs?learnerId=${placement.learner._id}`,
            });
          }
        });

        // 5. Placed Learners close to completion (endDate < 14 days) without Competency Assessment
        const fourteenDaysFromNow = new Date();
        fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

        // Find all active placements ending within the next 14 days
        const endingSoonPlacements = await Placement.find({
            status: 'Active',
            endDate: { $lte: fourteenDaysFromNow }
        }).select('learner endDate');

        const endingSoonLearnerIds = endingSoonPlacements.map(p => p.learner);

        // If there are placements ending soon, check which ones lack an assessment
        if (endingSoonLearnerIds.length > 0) {
            // Find all assessments for these specific learners
            const existingAssessments = await CompetencyAssessment.find({
                learner: { $in: endingSoonLearnerIds }
            }).select('learner');
            const assessedLearnerIds = existingAssessments.map(a => a.learner.toString());

            // Filter down to the learners who do NOT have an assessment
            const unassessedLearnerIds = endingSoonLearnerIds.filter(id => !assessedLearnerIds.includes(id.toString()));

            if (unassessedLearnerIds.length > 0) {
                 const unassessedLearners = await Learner.find({ ...filter, _id: { $in: unassessedLearnerIds } }).select('name trackingId');
                 
                 unassessedLearners.forEach(l => {
                     alerts.push({
                        type: 'Needs Assessment',
                        learnerId: l._id,
                        learnerName: l.name,
                        trackingId: l.trackingId,
                        message: 'Placement ending soon. Final assessment required.',
                        actionUrl: `/competency-assessments?learnerId=${l._id}`
                    });
                 });
            }
        }

        const supportScope = await getSupportTicketScope(req.user);
        const blockerTickets = await SupportTicket.find({
          ...supportScope,
          status: { $in: ['Open', 'InProgress'] },
          $or: [
            { escalationLevel: { $ne: 'None' } },
            { resolutionDueAt: { $lt: new Date() } },
          ],
        })
          .populate('learner', 'name trackingId')
          .sort({ updatedAt: -1 })
          .limit(10);

        blockerTickets.forEach((ticket) => {
          if (!ticket.learner) return;
          alerts.push({
            type: 'Support Blocker',
            learnerId: ticket.learner._id,
            learnerName: ticket.learner.name,
            trackingId: ticket.learner.trackingId,
            message: `Support blocker: ${ticket.subject}`,
            actionUrl: `/support-center?ticket=${ticket._id}`,
          });
        });

        res.json(alerts);
    } catch (error) {
        console.error("Error fetching action alerts:", error);
        res.status(500).json({ message: 'Server Error', error });
    }
});

router.post('/dashboard/bulk-reminders', async (req, res) => {
    try {
        if (!INSTITUTION_NOTIFICATION_ROLES.includes(req.user.role) || !req.user.institution) {
            return res.status(403).json({ message: 'Only institution users can send bulk reminders' });
        }

        const requestedTypes = Array.isArray(req.body?.types) && req.body.types.length > 0
          ? req.body.types
          : ['attendanceOverdue', 'monitoringOverdue', 'assessmentMidpointOverdue', 'assessmentFinalOverdue'];

        const validTypes = new Set(['attendanceOverdue', 'monitoringOverdue', 'assessmentMidpointOverdue', 'assessmentFinalOverdue']);
        const selectedTypes = requestedTypes.filter((type) => validTypes.has(type));

        const exceptionData = await getPlacementExceptionData(req.user.institution);
        const signals = getPlacementExceptionSignals(exceptionData).filter((signal) => selectedTypes.includes(signal.type));
        let remindersCreated = 0;

        for (const signal of signals) {
            const recipientIds = [
              signal.placement?.owner?._id?.toString?.(),
              signal.placement?.learner?.owner?.toString?.(),
            ].filter(Boolean);

            const beforeCount = await Notification.countDocuments({ dedupeKey: `bulk-reminder:${signal.dedupeKey}:${new Date().toISOString().slice(0, 10)}` });

            await notifyUsers({
              recipientIds,
              institution: req.user.institution,
              roles: recipientIds.length > 0 ? [] : INSTITUTION_NOTIFICATION_ROLES,
              sender: req.user._id,
              type: signal.type.startsWith('assessment') ? 'assessment' : signal.type === 'monitoringOverdue' ? 'visit' : 'report',
              title: `Reminder: ${signal.title}`,
              message: signal.message,
              link: signal.link,
              dedupeKey: `bulk-reminder:${signal.dedupeKey}:${new Date().toISOString().slice(0, 10)}`,
            });

            const afterCount = await Notification.countDocuments({ dedupeKey: `bulk-reminder:${signal.dedupeKey}:${new Date().toISOString().slice(0, 10)}` });
            if (afterCount > beforeCount) remindersCreated += afterCount - beforeCount;
        }

        res.json({
          remindersCreated,
          targetCount: signals.length,
        });
    } catch (error) {
        console.error('Error sending bulk reminders:', error);
        res.status(500).json({ message: 'Error sending bulk reminders' });
    }
});

router.get('/dashboard/map-data', async (req, res) => {
    try {
        const filter = await getFilter(req.user);

        // Map region names to approximate latitude/longitude
        const regionCoordinates = {
            "Greater Accra": [5.6037, -0.1870],
            "Ashanti": [6.6885, -1.6244],
            "Central": [5.1053, -1.2466],
            "Eastern": [6.0945, -0.2590],
            "Western": [5.1581, -2.2514],
            "Western North": [6.2575, -2.7667],
            "Volta": [6.6101, 0.4786],
            "Oti": [7.8860, 0.3541],
            "Northern": [9.4075, -0.8530],
            "Savannah": [9.0827, -1.8152],
            "North East": [10.5186, -0.3701],
            "Upper East": [10.7850, -0.8393],
            "Upper West": [10.0601, -2.5019],
            "Bono": [7.5855, -2.5517],
            "Bono East": [7.7854, -1.0425],
            "Ahafo": [6.9587, -2.4862]
        };

        // Find all active placements for calculating counts
        const placements = await Placement.find({ ...filter, status: 'Active' }).populate('learner', 'region');
        
        const countsByRegion = {};
        
        placements.forEach(p => {
             if (p.learner && p.learner.region) {
                 const region = p.learner.region;
                 countsByRegion[region] = (countsByRegion[region] || 0) + 1;
             }
        });

        // Format data for Leaflet
        const mapData = Object.keys(countsByRegion).map(region => ({
             region,
             count: countsByRegion[region],
             coordinates: regionCoordinates[region] || [7.9465, -1.0232] // Default broadly to center of Ghana
        }));

        res.json(mapData);
    } catch (error) {
        console.error("Error fetching map data:", error);
        res.status(500).json({ message: 'Server Error', error });
    }
});

// ==================== GLOBAL SEARCH ====================

router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.json({ learners: [], placements: [], institutions: [] });
        }

        const filter = await getFilter(req.user);
        const searchRegex = new RegExp(q, 'i');

        // Search Learners
        const learners = await Learner.find({
            ...filter,
            $or: [
                { name: searchRegex },
                { trackingId: searchRegex },
                { indexNumber: searchRegex }
            ]
        }).limit(5).select('name trackingId indexNumber');

        // Search Placements (distinct companies or individual placements)
        const placements = await Placement.find({
            ...filter,
            companyName: searchRegex
        }).limit(5).select('companyName address');

        // Search Institutions (SuperAdmin only)
        let institutions = [];
        if (req.user.role === 'SuperAdmin') {
            institutions = await Institution.find({
                $or: [
                    { name: searchRegex },
                    { code: searchRegex }
                ]
            }).limit(5).select('name code');
        }

        res.json({
            learners,
            placements,
            institutions
        });
    } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({ message: 'Search failed' });
    }
});

// ==================== CALENDAR SYSTEM ====================

router.get('/calendar/events', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        
        // 1. Learner Completions (from Placements)
        const completions = await Placement.find(filter)
            .populate('learner', 'name')
            .select('endDate companyName learner');

        const completionEvents = completions.map(c => ({
            id: `comp-${c._id}`,
            title: `Completion: ${c.learner?.name || 'Learner'}`,
            start: c.endDate,
            type: 'completion',
            description: `At ${c.companyName}`,
            color: '#10B981'
        }));

        // 2. Monitoring Visits
        const visits = await MonitoringVisit.find(filter)
            .populate('learner', 'name')
            .select('visitDate learner visitType');

        const visitEvents = visits.map(v => ({
            id: `visit-${v._id}`,
            title: `Visit: ${v.learner?.name || 'Learner'}`,
            start: v.visitDate,
            type: 'visit',
            description: `${v.visitType} Visit`,
            color: '#3B82F6'
        }));

        // 3. Academic Calendar Events (from HQ)
        const academicEvents = await AcademicCalendar.find({ isActive: true });
        const hqEvents = academicEvents.map(e => ({
            id: `acad-${e._id}`,
            title: e.title,
            start: e.startDate,
            end: e.endDate,
            type: 'academic',
            eventType: e.eventType,
            description: e.description || `${e.semester} — ${e.academicYear}`,
            color: e.eventType === 'Semester Start' ? '#8B5CF6' :
                   e.eventType === 'Semester End' ? '#EC4899' :
                   e.eventType === 'Exam Period' ? '#EF4444' :
                   e.eventType === 'Holiday' ? '#10B981' :
                   e.eventType === 'Deadline' ? '#F59E0B' : '#6B7280'
        }));

        res.json([...completionEvents, ...visitEvents, ...hqEvents]);
    } catch (error) {
        console.error("Calendar fetch error:", error);
        res.status(500).json({ message: 'Failed to fetch calendar events' });
    }
});

// ==================== ACADEMIC CALENDAR CRUD (HQ Only) ====================

router.get('/academic-terms', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const terms = await AcademicTerm.find()
            .populate('createdBy', 'name email')
            .sort({ startDate: -1 });
        res.json(terms);
    } catch (error) {
        console.error('Error fetching academic terms:', error);
        res.status(500).json({ message: 'Error fetching academic terms' });
    }
});

router.post('/academic-terms', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const { name, academicYear, termType, startDate, endDate, status, isCurrent, notes } = req.body;

        if (!name || !academicYear || !startDate || !endDate) {
            return res.status(400).json({ message: 'Name, academic year, start date, and end date are required' });
        }

        if (new Date(endDate) < new Date(startDate)) {
            return res.status(400).json({ message: 'End date cannot be before start date' });
        }

        if (isCurrent) {
            await AcademicTerm.updateMany({ isCurrent: true }, { $set: { isCurrent: false } });
        }

        const term = await AcademicTerm.create({
            name,
            academicYear,
            termType,
            startDate,
            endDate,
            status,
            isCurrent: Boolean(isCurrent),
            notes: notes || '',
            createdBy: req.user._id,
        });

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'AcademicTerm',
            entityId: term._id,
            summary: `Created academic term ${term.name}`,
            after: term,
        });

        const populatedTerm = await AcademicTerm.findById(term._id).populate('createdBy', 'name email');
        res.status(201).json(populatedTerm);
    } catch (error) {
        console.error('Error creating academic term:', error);
        res.status(500).json({ message: 'Error creating academic term' });
    }
});

router.put('/academic-terms/:id', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const existingTerm = await AcademicTerm.findById(req.params.id);
        if (!existingTerm) return res.status(404).json({ message: 'Academic term not found' });

        if (req.body.startDate && req.body.endDate && new Date(req.body.endDate) < new Date(req.body.startDate)) {
            return res.status(400).json({ message: 'End date cannot be before start date' });
        }

        if (req.body.isCurrent) {
            await AcademicTerm.updateMany({ _id: { $ne: req.params.id }, isCurrent: true }, { $set: { isCurrent: false } });
        }

        const updatedTerm = await AcademicTerm.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' })
            .populate('createdBy', 'name email');

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'AcademicTerm',
            entityId: req.params.id,
            summary: `Updated academic term ${updatedTerm?.name || req.params.id}`,
            before: existingTerm,
            after: updatedTerm,
        });

        res.json(updatedTerm);
    } catch (error) {
        console.error('Error updating academic term:', error);
        res.status(500).json({ message: 'Error updating academic term' });
    }
});

router.delete('/academic-terms/:id', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const deletedTerm = await AcademicTerm.findByIdAndDelete(req.params.id);
        if (!deletedTerm) return res.status(404).json({ message: 'Academic term not found' });

        await logAuditEvent({
            req,
            action: 'DELETE',
            entityType: 'AcademicTerm',
            entityId: deletedTerm._id,
            summary: `Deleted academic term ${deletedTerm.name}`,
            before: deletedTerm,
        });

        res.json({ message: 'Academic term deleted' });
    } catch (error) {
        console.error('Error deleting academic term:', error);
        res.status(500).json({ message: 'Error deleting academic term' });
    }
});

// List all academic calendar events
router.get('/academic-calendar', async (req, res) => {
    try {
        const events = await AcademicCalendar.find()
            .populate('createdBy', 'name email')
            .sort({ startDate: 1 });
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// Create academic calendar event
router.post('/academic-calendar', async (req, res) => {
    try {
        const event = new AcademicCalendar({
            ...req.body,
            createdBy: req.user._id,
        });
        await event.save();
        res.status(201).json(event);
    } catch (error) {
        console.error('Error creating academic event:', error);
        res.status(500).json({ message: 'Failed to create event' });
    }
});

// Update academic calendar event
router.put('/academic-calendar/:id', async (req, res) => {
    try {
        const event = await AcademicCalendar.findByIdAndUpdate(
            req.params.id,
            req.body,
            { returnDocument: 'after' }
        );
        if (!event) return res.status(404).json({ message: 'Event not found' });
        res.json(event);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update event' });
    }
});

// Delete academic calendar event
router.delete('/academic-calendar/:id', async (req, res) => {
    try {
        await AcademicCalendar.findByIdAndDelete(req.params.id);
        res.json({ message: 'Event deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete event' });
    }
});

// ==================== TERM CLOSURE REPORTS ====================

// Helper: Build metrics, summary, and exceptions for a term closure report
const buildTermClosureData = async (institution, start, end) => {
    // Learner stats
    const learners = await Learner.find({ institution, createdAt: { $lte: end } });
    const academicActive = learners.filter((l) => l.academicStatus === 'Active').length;
    const academicGraduating = learners.filter((l) => l.academicStatus === 'Graduating').length;
    const academicGraduated = learners.filter((l) => l.academicStatus === 'Graduated').length;
    const academicDropped = learners.filter((l) => l.academicStatus === 'Dropped').length;
    const currentEnrolled = academicActive + academicGraduating;
    const placed = learners.filter(l => l.status === 'Placed').length;
    const pending = learners.filter(l => l.status === 'Pending').length;
    const completed = learners.filter(l => l.status === 'Completed').length;
    const dropped = learners.filter(l => l.status === 'Dropped').length;

    // Program breakdown
    const programMap = {};
    learners.forEach(l => {
        programMap[l.program] = (programMap[l.program] || 0) + 1;
    });
    const programBreakdown = Object.entries(programMap).map(([program, count]) => ({ program, count }));

    const learnerIds = learners.map(l => l._id);

    // Bulk-fetch related data in parallel
    const [
        monitoringVisits,
        assessments,
        attendanceLogs,
        ticketsOpened,
        ticketsResolved,
        placements,
    ] = await Promise.all([
        MonitoringVisit.find({ institution, visitDate: { $gte: start, $lte: end } }).select('learner visitDate').lean(),
        CompetencyAssessment.find({ institution, createdAt: { $gte: start, $lte: end } }).select('learner assessmentDate').lean(),
        AttendanceLog.find({ institution, periodEnd: { $gte: start, $lte: end } }).select('learner placement hoursWorked').lean(),
        SupportTicket.countDocuments({ institution, createdAt: { $gte: start, $lte: end } }),
        SupportTicket.countDocuments({ institution, createdAt: { $gte: start, $lte: end }, status: { $in: ['Resolved', 'Closed'] } }),
        Placement.find({ institution, createdAt: { $lte: end } }).select('learner status').lean(),
    ]);

    // Index by learner for exception building
    const visitsByLearner = new Set(monitoringVisits.map(v => v.learner.toString()));
    const assessmentsByLearner = new Set(assessments.map(a => a.learner.toString()));
    const attendanceByLearner = new Set(attendanceLogs.map(a => a.learner.toString()));
    const placedLearnerIds = new Set(placements.map(p => p.learner.toString()));

    // Health scores: compute avg for placed learners
    const placedLearnerCount = placedLearnerIds.size;
    const learnersWithVisits = learnerIds.filter(id => visitsByLearner.has(id.toString())).length;
    const learnersWithAssessments = learnerIds.filter(id => assessmentsByLearner.has(id.toString())).length;

    const totalHoursLogged = attendanceLogs.reduce((sum, a) => sum + (a.hoursWorked || 0), 0);
    const placementRate = learners.length > 0 ? Math.round((placed / learners.length) * 100) : 0;
    const visitCoverage = placedLearnerCount > 0 ? Math.round((learnersWithVisits / placedLearnerCount) * 100) : 0;
    const assessmentCoverage = placedLearnerCount > 0 ? Math.round((learnersWithAssessments / placedLearnerCount) * 100) : 0;
    const ticketResolutionRate = ticketsOpened > 0 ? Math.round((ticketsResolved / ticketsOpened) * 100) : 100;

    // Build exception list (only for placed/active learners)
    const exceptions = [];
    for (const learner of learners) {
        const lid = learner._id.toString();
        if (learner.status !== 'Placed' && learner.status !== 'Completed') continue;

        const reasons = [];
        if (!placedLearnerIds.has(lid)) reasons.push('No placement record');
        if (!attendanceByLearner.has(lid)) reasons.push('No attendance logs');
        if (!visitsByLearner.has(lid)) reasons.push('No monitoring visits');
        if (!assessmentsByLearner.has(lid)) reasons.push('No competency assessments');

        if (reasons.length > 0) {
            exceptions.push({
                learnerId: learner._id,
                learnerName: `${learner.firstName || ''} ${learner.lastName || ''}`.trim() || learner.name || 'Unknown',
                trackingId: learner.trackingId || '',
                reasons,
            });
        }
    }

    // Avg health score placeholder (derived from dimension coverage)
    const avgHealthScore = Math.round(
        ((placementRate > 0 ? 20 : 0) +
        (visitCoverage >= 80 ? 20 : visitCoverage >= 40 ? 10 : 0) +
        (assessmentCoverage >= 80 ? 20 : assessmentCoverage >= 40 ? 10 : 0) +
        (ticketResolutionRate >= 80 ? 20 : ticketResolutionRate >= 40 ? 10 : 0) +
        (attendanceLogs.length > 0 ? 20 : 0))
    );

    return {
        summary: {
            totalLearners: learners.length,
            currentEnrolled,
            academicActive,
            academicGraduating,
            academicGraduated,
            academicDropped,
            placed,
            pending,
            completed,
            dropped,
            totalMonitoringVisits: monitoringVisits.length,
            totalCompetencyAssessments: assessments.length,
            programBreakdown,
        },
        metrics: {
            placementRate,
            avgHealthScore,
            attendanceLogCount: attendanceLogs.length,
            totalHoursLogged,
            avgHoursPerLearner: placedLearnerCount > 0 ? Math.round(totalHoursLogged / placedLearnerCount) : 0,
            visitCoverage,
            assessmentCoverage,
            ticketsOpened,
            ticketsResolved,
            ticketResolutionRate,
        },
        exceptions,
    };
};

// Initiate term closure (replaces manual generate)
router.post('/semester-reports/initiate', async (req, res) => {
    try {
        const { termId } = req.body;
        const institution = req.user.institution;

        if (!termId) {
            return res.status(400).json({ message: 'termId is required.' });
        }

        const term = await AcademicTerm.findById(termId);
        if (!term) {
            return res.status(404).json({ message: 'Academic term not found.' });
        }

        // Check for duplicate
        const exists = await SemesterReport.findOne({ institution, academicTerm: term._id });
        if (exists) {
            return res.status(409).json({ message: 'A closure report for this term already exists.', existingId: exists._id });
        }

        const start = new Date(term.startDate);
        const end = new Date(term.endDate);

        const { summary, metrics, exceptions } = await buildTermClosureData(institution, start, end);

        const report = new SemesterReport({
            institution,
            semester: term.termType || term.name,
            academicYear: term.academicYear,
            periodStart: start,
            periodEnd: end,
            generatedBy: req.user._id,
            academicTerm: term._id,
            status: 'Draft',
            summary,
            metrics,
            exceptions,
            commentary: { challenges: '', highlights: '', recommendations: '' },
        });

        await report.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `Initiated term closure for ${institution} — ${term.name} (${term.academicYear})`,
            after: report,
        });

        const populated = await SemesterReport.findById(report._id)
            .populate('generatedBy', 'name email')
            .populate('academicTerm');
        res.status(201).json(populated);
    } catch (error) {
        console.error('Error initiating term closure:', error);
        res.status(500).json({ message: 'Failed to initiate term closure' });
    }
});

// Keep legacy generate endpoint for backward compat
router.post('/semester-reports/generate', async (req, res) => {
    try {
        const { semester, academicYear, periodStart, periodEnd } = req.body;
        const institution = req.user.institution;

        if (!semester || !academicYear || !periodStart || !periodEnd) {
            return res.status(400).json({ message: 'semester, academicYear, periodStart, and periodEnd are required.' });
        }

        const start = new Date(periodStart);
        const end = new Date(periodEnd);

        const exists = await SemesterReport.findOne({ institution, semester, academicYear });
        if (exists) {
            return res.status(409).json({ message: 'A report for this semester and academic year already exists.' });
        }

        const { summary, metrics, exceptions } = await buildTermClosureData(institution, start, end);

        const report = new SemesterReport({
            institution,
            semester,
            academicYear,
            periodStart: start,
            periodEnd: end,
            generatedBy: req.user._id,
            status: 'Draft',
            summary,
            metrics,
            exceptions,
            commentary: { challenges: '', highlights: '', recommendations: '' },
        });

        await report.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `Generated semester report for ${report.institution}`,
            after: report,
        });
        res.status(201).json(report);
    } catch (error) {
        console.error('Error generating semester report:', error);
        res.status(500).json({ message: 'Failed to generate semester report' });
    }
});

// List semester reports
router.get('/semester-reports', async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'RegionalAdmin') {
            const insts = await Institution.find({ region: req.user.region }).select('name');
            const instNames = insts.map(i => i.name);
            filter.institution = { $in: instNames };
        } else if (req.user.role !== 'SuperAdmin') {
            filter.institution = req.user.institution;
        }
        const reports = await SemesterReport.find(filter)
            .populate('generatedBy', 'name email')
            .populate('reviewedByRegional', 'name email')
            .populate('reviewedByHQ', 'name email')
            .populate('certifiedBy', 'name email')
            .populate('academicTerm')
            .sort({ createdAt: -1 });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// Get single semester report
router.get('/semester-reports/:id', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id)
            .populate('generatedBy', 'name email')
            .populate('reviewedByRegional', 'name email')
            .populate('reviewedByHQ', 'name email')
            .populate('certifiedBy', 'name email')
            .populate('academicTerm');
        if (!report) return res.status(404).json({ message: 'Report not found' });
        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// Refresh metrics (only in Draft status)
router.put('/semester-reports/:id/refresh-metrics', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        if (report.status !== 'Draft') {
            return res.status(400).json({ message: 'Metrics can only be refreshed in Draft status.' });
        }

        const start = new Date(report.periodStart);
        const end = new Date(report.periodEnd);
        const { summary, metrics, exceptions } = await buildTermClosureData(report.institution, start, end);

        report.summary = summary;
        report.metrics = metrics;
        report.exceptions = exceptions;
        await report.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `Refreshed metrics for term closure report — ${report.institution}`,
        });

        const populated = await SemesterReport.findById(report._id)
            .populate('generatedBy', 'name email')
            .populate('certifiedBy', 'name email')
            .populate('academicTerm');
        res.json(populated);
    } catch (error) {
        console.error('Error refreshing metrics:', error);
        res.status(500).json({ message: 'Failed to refresh metrics' });
    }
});

// Certify report (saves commentary, marks as certified)
router.put('/semester-reports/:id/certify', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        if (report.status !== 'Draft' && report.status !== 'Rejected') {
            return res.status(400).json({ message: 'Report can only be certified from Draft or Rejected status.' });
        }

        const { commentary } = req.body;
        if (commentary) {
            report.commentary = {
                challenges: commentary.challenges || '',
                highlights: commentary.highlights || '',
                recommendations: commentary.recommendations || '',
            };
        }
        report.certifiedBy = req.user._id;
        report.certifiedAt = new Date();
        report.status = 'Certified';
        await report.save();

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `Certified term closure report for ${report.institution}`,
            changedFields: ['status', 'certifiedBy', 'certifiedAt', 'commentary'],
            after: report,
        });

        const populated = await SemesterReport.findById(report._id)
            .populate('generatedBy', 'name email')
            .populate('certifiedBy', 'name email')
            .populate('academicTerm');
        res.json(populated);
    } catch (error) {
        console.error('Error certifying report:', error);
        res.status(500).json({ message: 'Failed to certify report' });
    }
});

// Submit report to Regional Office (only from Certified)
router.put('/semester-reports/:id/submit', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        // Allow submit from Certified (new flow) or Generated/Rejected (legacy)
        if (!['Certified', 'Generated', 'Rejected'].includes(report.status)) {
            return res.status(400).json({ message: 'Report must be certified before submission.' });
        }
        report.status = 'Submitted';
        await report.save();
        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `Submitted term closure report for ${report.institution}`,
            changedFields: ['status'],
            after: report,
        });

        notifyUsers({
            roles: ['RegionalAdmin'],
            region: report.region,
            sender: req.user._id,
            type: 'report',
            title: 'Term Closure Report Submitted',
            message: `${report.institution} has submitted a term closure report for review.`,
            link: `/semester-reports/${report._id}`
        });

        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Failed to submit report' });
    }
});

// Regional Office approves
router.put('/semester-reports/:id/regional-approve', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        if (report.status !== 'Submitted') {
            return res.status(400).json({ message: 'Report must be in Submitted status to approve regionally.' });
        }
        const before = report.toObject();
        report.status = 'Regional_Approved';
        report.reviewedByRegional = req.user._id;
        report.regionalComment = req.body.comment || '';
        await report.save();
        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `Regionally approved term closure report for ${report.institution}`,
            before,
            after: report,
        });

        notifyUsers({
            roles: ['SuperAdmin'],
            sender: req.user._id,
            type: 'report',
            title: 'Report Endorsed Regionally',
            message: `A report from ${report.institution} was regionally endorsed and requires HQ approval.`,
            link: `/semester-reports/${report._id}`
        });

        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Failed to approve report' });
    }
});

// HQ approves
router.put('/semester-reports/:id/hq-approve', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        if (report.status !== 'Regional_Approved') {
            return res.status(400).json({ message: 'Report must be Regional_Approved before HQ approval.' });
        }
        const before = report.toObject();
        report.status = 'HQ_Approved';
        report.reviewedByHQ = req.user._id;
        report.hqComment = req.body.comment || '';
        await report.save();
        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `HQ approved term closure report for ${report.institution}`,
            before,
            after: report,
        });
        
        // Notify
        notifyInstitutionAdmins(report.institution, sendReportStatusEmail, report.semester, report.academicYear, 'HQ_Approved');
        
        notifyUsers({
            institution: report.institution,
            roles: ['Admin', 'RegionalAdmin'],
            sender: req.user._id,
            type: 'report',
            title: 'Report Approved by HQ',
            message: `The term closure report for ${report.institution} has been officially approved by HQ.`,
            link: `/semester-reports/${report._id}`
        });

        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Failed to approve report' });
    }
});

// Reject report
router.put('/semester-reports/:id/reject', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        const before = report.toObject();
        report.status = 'Rejected';
        if (req.user.role === 'SuperAdmin') {
            report.reviewedByHQ = req.user._id;
            report.hqComment = req.body.comment || 'Rejected by HQ';
        } else {
            report.reviewedByRegional = req.user._id;
            report.regionalComment = req.body.comment || 'Rejected by Regional';
        }
        await report.save();
        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `Rejected term closure report for ${report.institution}`,
            before,
            after: report,
        });

        notifyInstitutionAdmins(report.institution, sendReportStatusEmail, report.semester, report.academicYear, 'Rejected');

        notifyUsers({
            institution: report.institution,
            roles: ['Admin', 'Manager', 'RegionalAdmin'],
            sender: req.user._id,
            type: 'report',
            title: 'Report Rejected',
            message: `The term closure report for ${report.institution} was rejected. Reason: ${req.body.comment || 'N/A'}.`,
            link: `/semester-reports/${report._id}`
        });

        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Failed to reject report' });
    }
});

// ==================== COMPETENCY ASSESSMENTS ====================

router.get('/assessments', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const assessments = await CompetencyAssessment.find(filter).populate('learner');
        res.json(assessments);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/assessments', async (req, res) => {
    try {
        // Auto-populate trackingId from learner if not provided
        let trackingId = req.body.trackingId;
        if (!trackingId && req.body.learner) {
            const learner = await Learner.findById(req.body.learner);
            if (learner) trackingId = learner.trackingId;
        }

        const newAssessment = new CompetencyAssessment({
            ...req.body,
            trackingId,
            institution: req.user.institution,
        });
        await newAssessment.save();

        // Automatically graduate learner
        let learnerName = 'A learner';
        if (req.body.learner) {
            const updatedLearner = await Learner.findByIdAndUpdate(req.body.learner, { status: 'Completed' }, { new: true });
            if (updatedLearner) learnerName = updatedLearner.name;
        }

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'CompetencyAssessment',
            entityId: newAssessment._id,
            summary: `Created competency assessment for ${learnerName}`,
            after: newAssessment,
        });

        notifyUsers({
            institution: req.user.institution,
            roles: ['Admin', 'Manager'],
            sender: req.user._id,
            type: 'assessment',
            title: 'Competency Assessment Logged',
            message: `A competency assessment was completed for ${learnerName}.`,
            link: '/assessments'
        });

        res.status(201).json(newAssessment);
    } catch (error) {
        console.error("Error creating assessment:", error);
        res.status(500).json({ message: 'Error creating assessment', detail: error.message });
    }
});

router.put('/assessments/:id', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const existingAssessment = await CompetencyAssessment.findOne({ _id: req.params.id, ...filter });
        const updatedAssessment = await CompetencyAssessment.findOneAndUpdate(
            { _id: req.params.id, ...filter }, 
            req.body, 
            { returnDocument: 'after' }
        );
        if (!updatedAssessment) return res.status(404).json({ message: 'Assessment not found or unauthorized' });
        if (existingAssessment) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'CompetencyAssessment',
                entityId: updatedAssessment._id,
                summary: `Updated competency assessment ${updatedAssessment._id}`,
                before: existingAssessment,
                after: updatedAssessment,
            });
        }
        res.json(updatedAssessment);
    } catch (error) {
        res.status(500).json({ message: 'Error updating assessment' });
    }
});

router.delete('/assessments/:id', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const deletedAssessment = await CompetencyAssessment.findOneAndDelete({ _id: req.params.id, ...filter });
        if (!deletedAssessment) return res.status(404).json({ message: 'Assessment not found or unauthorized' });
        await logAuditEvent({
            req,
            action: 'DELETE',
            entityType: 'CompetencyAssessment',
            entityId: deletedAssessment._id,
            summary: `Deleted competency assessment ${deletedAssessment._id}`,
            before: deletedAssessment,
        });
        res.json({ message: 'Assessment deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting assessment' });
    }
});

// ==================== LEARNERS ====================

router.get('/learners', async (req, res) => {
  try {
    const filter = await getFilter(req.user);
    const query = { ...filter };
    const { status, academicStatus, year, program, intakeAcademicYear, availableForPlacement } = req.query;

    if (status) query.status = status;
    if (academicStatus === 'CurrentEnrolled') query.academicStatus = { $in: ['Active', 'Graduating'] };
    else if (academicStatus) query.academicStatus = academicStatus;
    if (year) query.year = year;
    if (program) query.program = program;
    if (intakeAcademicYear) query.intakeAcademicYear = intakeAcademicYear;

    let learners = await Learner.find(query)
      .populate('placement')
      .populate('owner', 'name role institution');
    const learnerIds = learners.map((learner) => learner._id);
    let activePlacementLearnerIds = new Set();

    if (availableForPlacement === 'true' && learnerIds.length > 0) {
      const activePlacements = await Placement.find({
        learner: { $in: learnerIds },
        status: 'Active',
      }).select('learner');

      activePlacementLearnerIds = new Set(activePlacements.map((placement) => placement.learner.toString()));
      learners = learners.filter((learner) => {
        const academicState = learner.academicStatus || 'Active';
        if (!['Active', 'Graduating'].includes(academicState)) return false;
        return !activePlacementLearnerIds.has(learner._id.toString());
      });
    }

    const documents = await Document.find({ learner: { $in: learnerIds } }).select('learner category institution');
    const documentsByLearner = new Map();
    documents.forEach((doc) => {
      const key = doc.learner?.toString();
      if (!documentsByLearner.has(key)) documentsByLearner.set(key, []);
      documentsByLearner.get(key).push(doc);
    });
    res.json(learners.map((learner) => ({
      ...learner.toObject(),
      readiness: buildLearnerReadiness(learner, documentsByLearner.get(learner._id.toString()) || []),
      hasActivePlacement: activePlacementLearnerIds.has(learner._id.toString()),
    })));
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

router.post('/learners', async (req, res) => {
  try {
    const inst = await Institution.findOne({ name: req.user.institution });
    const region = inst ? inst.region : 'Unknown';
    const academicYear = req.body.intakeAcademicYear || await resolveCurrentAcademicYear();

    const newLearner = new Learner({
      ...req.body,
      dateOfBirth: req.body.dateOfBirth || null,
      intakeAcademicYear: academicYear,
      academicStatus: req.body.status === 'Dropped' ? 'Dropped' : (req.body.academicStatus || 'Active'),
      institution: req.user.institution,
      region: region,
      progressionHistory: [{
        academicYear,
        action: 'Intake',
        fromYear: '',
        toYear: req.body.year,
        note: 'Learner registered into institution intake',
        changedBy: req.user._id,
      }],
    });
    await newLearner.save();
    await logAuditEvent({
      req,
      action: 'CREATE',
      entityType: 'Learner',
      entityId: newLearner._id,
      summary: `Created learner ${newLearner.name}`,
      after: newLearner,
    });
    res.status(201).json(newLearner);
  } catch (error) {
    res.status(500).json({ message: 'Error creating learner' });
  }
});

// Bulk CSV upload
router.post('/learners/bulk', async (req, res) => {
  try {
    const { learners } = req.body;
    if (!Array.isArray(learners) || learners.length === 0) {
      return res.status(400).json({ message: 'No learner data provided' });
    }

    const inst = await Institution.findOne({ name: req.user.institution });
    const region = inst ? inst.region : 'Unknown';
    const academicYear = await resolveCurrentAcademicYear();

    const results = { created: 0, errors: [] };

    for (let i = 0; i < learners.length; i++) {
      try {
        const row = learners[i];
        const learner = new Learner({
          lastName: row.lastName || row['Last Name'] || '',
          firstName: row.firstName || row['First Name'] || '',
          middleName: row.middleName || row['Middle Name'] || '',
          gender: row.gender || row['Gender'] || '',
          dateOfBirth: row.dateOfBirth || row['Date of Birth'] || null,
          phone: row.phone || row['Phone'] || '',
          guardianContact: row.guardianContact || row['Guardian Contact'] || '',
          indexNumber: row.indexNumber || row['Index Number'] || '',
          program: row.program || row['Program'] || '',
          year: row.year || row['Year'] || '',
          intakeAcademicYear: row.intakeAcademicYear || row['Intake Academic Year'] || academicYear,
          institution: req.user.institution,
          region: region,
          status: 'Pending',
          academicStatus: 'Active',
          progressionHistory: [{
            academicYear: row.intakeAcademicYear || row['Intake Academic Year'] || academicYear,
            action: 'Intake',
            fromYear: '',
            toYear: row.year || row['Year'] || '',
            note: 'Learner imported through bulk intake',
            changedBy: req.user._id,
          }],
        });
        await learner.save();
        results.created++;
      } catch (err) {
        results.errors.push({ row: i + 1, message: err.message });
      }
    }

    await logAuditEvent({
      req,
      action: 'CREATE',
      entityType: 'LearnerBulkImport',
      entityId: `${req.user._id}-${Date.now()}`,
      summary: `Bulk imported ${results.created} learners`,
      metadata: results,
    });
    res.status(201).json(results);
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ message: 'Bulk upload failed' });
  }
});

router.get('/learners/:id', async (req, res) => {
  try {
    const filter = await getFilter(req.user);
    const learner = await Learner.findOne({ _id: req.params.id, ...filter }).populate('placement');

    if (!learner) {
      return res.status(404).json({ message: 'Learner not found or unauthorized' });
    }

    const documents = await Document.find({ learner: learner._id }).select('category');
    res.json({
      ...learner.toObject(),
      readiness: buildLearnerReadiness(learner, documents),
      age: calculateAgeYears(learner.dateOfBirth),
      isUnder18: isLearnerUnder18(learner),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching learner' });
  }
});

router.put('/learners/:id', async (req, res) => {
    try {
        const existingLearner = await Learner.findById(req.params.id);
        if (!existingLearner) {
            return res.status(404).json({ message: 'Learner not found' });
        }

        const payload = { ...req.body };
        if (payload.dateOfBirth === '') {
            payload.dateOfBirth = null;
        }
        if (payload.status === 'Dropped') {
            payload.academicStatus = 'Dropped';
        }
        if (payload.academicStatus === 'Dropped') {
            payload.status = 'Dropped';
        }
        if (payload.academicStatus === 'Graduated' && !payload.graduationAcademicYear) {
            payload.graduationAcademicYear = await resolveCurrentAcademicYear();
            payload.graduatedAt = payload.graduatedAt || new Date();
        }

        const updatedLearner = await Learner.findByIdAndUpdate(req.params.id, payload, { returnDocument: 'after' });
        if (updatedLearner && existingLearner) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'Learner',
                entityId: updatedLearner._id,
                summary: `Updated learner ${updatedLearner.name}`,
                before: existingLearner,
                after: updatedLearner,
            });
        }
        res.json(updatedLearner);
    } catch (error) {
        res.status(500).json({ message: 'Error updating learner' });
    }
});

router.post('/learners/promote-year', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const { fromYear, learnerIds } = req.body;
        const toYear = nextStudyYear(fromYear);

        if (!toYear) {
            return res.status(400).json({ message: 'Only Year 1 and Year 2 learners can be promoted.' });
        }

        const academicYear = await resolveCurrentAcademicYear();
        const query = {
            ...filter,
            year: fromYear,
            academicStatus: { $in: ['Active', 'Graduating'] },
        };
        if (Array.isArray(learnerIds) && learnerIds.length) {
            query._id = { $in: learnerIds };
        }

        const learners = await Learner.find(query);
        if (!learners.length) {
            return res.status(404).json({ message: `No eligible ${fromYear} learners found for promotion.` });
        }

        for (const learner of learners) {
            learner.year = toYear;
            learner.academicStatus = 'Active';
            learner.progressionHistory.push({
                academicYear,
                action: 'Promoted',
                fromYear,
                toYear,
                note: `Promoted from ${fromYear} to ${toYear}`,
                changedBy: req.user._id,
            });
            await learner.save();
        }

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'LearnerBulkProgression',
            entityId: `${req.user._id}-${Date.now()}`,
            summary: `Promoted ${learners.length} learner(s) from ${fromYear} to ${toYear}`,
            metadata: { learnerIds: learners.map((learner) => learner._id), fromYear, toYear, academicYear },
        });

        res.json({ promoted: learners.length, fromYear, toYear, academicYear });
    } catch (error) {
        console.error('Error promoting learners:', error);
        res.status(500).json({ message: 'Error promoting learners' });
    }
});

router.post('/learners/graduate', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const { learnerIds } = req.body;
        const academicYear = await resolveCurrentAcademicYear();
        const query = {
            ...filter,
            year: 'Year 3',
            academicStatus: { $ne: 'Graduated' },
        };
        if (Array.isArray(learnerIds) && learnerIds.length) {
            query._id = { $in: learnerIds };
        }

        const learners = await Learner.find(query);
        if (!learners.length) {
            return res.status(404).json({ message: 'No eligible Year 3 learners found for graduation.' });
        }

        for (const learner of learners) {
            learner.academicStatus = 'Graduated';
            learner.graduationAcademicYear = academicYear;
            learner.graduatedAt = new Date();
            learner.progressionHistory.push({
                academicYear,
                action: 'Graduated',
                fromYear: learner.year,
                toYear: learner.year,
                note: 'Marked as graduated after completing final year',
                changedBy: req.user._id,
            });
            await learner.save();
        }

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'LearnerGraduation',
            entityId: `${req.user._id}-${Date.now()}`,
            summary: `Graduated ${learners.length} Year 3 learner(s)`,
            metadata: { learnerIds: learners.map((learner) => learner._id), academicYear },
        });

        res.json({ graduated: learners.length, academicYear });
    } catch (error) {
        console.error('Error graduating learners:', error);
        res.status(500).json({ message: 'Error graduating learners' });
    }
});

router.put('/learners/:id/owner', async (req, res) => {
    try {
        if (!canManageOperationalOwnership(req.user)) {
            return res.status(403).json({ message: 'You do not have permission to assign learner owners' });
        }

        const filter = await getFilter(req.user);
        const learner = await Learner.findOne({ _id: req.params.id, ...filter });
        if (!learner) {
            return res.status(404).json({ message: 'Learner not found or unauthorized' });
        }

        const { ownerId } = req.body;
        let owner = null;
        if (ownerId) {
            owner = await User.findOne({ _id: ownerId, institution: learner.institution, role: { $in: ['Admin', 'Manager', 'Staff'] } }).select('_id name role institution');
            if (!owner) {
                return res.status(400).json({ message: 'Selected owner is invalid for this learner' });
            }
        }

        const before = learner.toObject();
        learner.owner = owner?._id || undefined;
        await learner.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'Learner',
            entityId: learner._id,
            summary: `Updated operational owner for learner ${learner.name}`,
            before,
            after: learner,
            changedFields: ['owner'],
        });

        const populatedLearner = await Learner.findById(learner._id)
            .populate('owner', 'name role institution');

        res.json(populatedLearner);
    } catch (error) {
        console.error('Error updating learner owner:', error);
        res.status(500).json({ message: 'Error updating learner owner' });
    }
});

router.delete('/learners/:id', async (req, res) => {
    try {
        const deletedLearner = await Learner.findByIdAndDelete(req.params.id);
        if (deletedLearner) {
            await logAuditEvent({
                req,
                action: 'DELETE',
                entityType: 'Learner',
                entityId: deletedLearner._id,
                summary: `Deleted learner ${deletedLearner.name}`,
                before: deletedLearner,
            });
        }
        res.json({ message: 'Learner deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting learner' });
    }
});

// ==================== LEARNER PROFILE ====================

router.get('/learners/:id/profile', async (req, res) => {
  try {
    const filter = await getFilter(req.user);

    // 1. Fetch Learner
    const learner = await Learner.findOne({ _id: req.params.id, ...filter })
      .populate('placement')
      .populate('owner', 'name role institution');
    if (!learner) {
      return res.status(404).json({ message: 'Learner not found or unauthorized' });
    }

    // 2. Fetch Related Records
    const placements = await Placement.find({ learner: req.params.id, ...filter })
      .populate('partner', 'name')
      .populate('owner', 'name role institution')
      .sort({ startDate: -1 });
    const documents = await Document.find({ learner: req.params.id }).sort({ createdAt: -1 });
    const visits = await MonitoringVisit.find({ learner: req.params.id, ...filter }).sort({ visitDate: -1 });
    const reports = await SemesterReport.find({ institution: learner.institution }).sort({ createdAt: -1 });
    const assessments = await CompetencyAssessment.find({ learner: req.params.id, ...filter }).sort({ assessmentDate: -1 });
    const evaluations = await EmployerEvaluation.find({ learner: req.params.id }).populate('partner', 'name').sort({ evaluationDate: -1 });
    const linkedGuardians = await User.find({ role: 'Guardian', linkedLearners: learner._id })
      .select('name email phone status')
      .sort({ name: 1 })
      .lean();
    const placementAgreements = await PlacementAgreement.find({ learner: learner._id }).lean();
    const consentRecords = await GuardianConsent.find({ learner: learner._id })
      .sort({ signedAt: -1, createdAt: -1 })
      .lean();
    const supportScope = await getSupportTicketScope(req.user);
    const learnerSupportTickets = await SupportTicket.find({
      ...supportScope,
      $or: [
        { learner: learner._id },
        { placement: { $in: placements.map((placement) => placement._id) } },
      ],
    })
      .select('_id subject ticketType incidentType placement learner createdAt updatedAt')
      .lean();
    const evidenceDocuments = await Document.find({
      $or: [
        { learner: learner._id },
        { placement: { $in: placements.map((placement) => placement._id) } },
        { supportTicket: { $in: learnerSupportTickets.map((ticket) => ticket._id) } },
        { employerEvaluation: { $in: evaluations.map((evaluation) => evaluation._id) } },
      ],
    })
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();
    const activePlacement = placements.find((placement) => placement.status === 'Active') || placements[0] || null;
    const activeConsentRecord = activePlacement
      ? consentRecords.find((record) => record.placement?.toString() === activePlacement._id.toString()) || consentRecords[0] || null
      : consentRecords[0] || null;
    let activePlacementManagement = null;

    if (activePlacement) {
      try {
        const systemSettings = await getOrCreateSystemSettings();
        const attendanceLogs = await AttendanceLog.find({ learner: req.params.id, placement: activePlacement._id }).sort({ periodEnd: -1 });
        const linkedSupportTickets = await SupportTicket.find({
          ...supportScope,
          $or: [
            { learner: learner._id },
            { placement: activePlacement._id },
          ],
          status: { $in: ['Open', 'InProgress'] },
        })
          .populate('requester', 'name email role institution')
          .populate('assignedTo', 'name email role institution')
          .populate('escalatedTo', 'name email role institution')
          .sort({ updatedAt: -1 });

        activePlacementManagement = calculatePlacementManagementSummary({
          placement: activePlacement,
          attendanceLogs,
          visits,
          assessments,
          evaluations,
          supportTickets: linkedSupportTickets,
          cadenceSettings: systemSettings,
        });
      } catch (managementError) {
        console.error('Error building active placement management summary:', managementError);
      }
    }

    const placementsById = new Map(placements.map((placement) => [placement._id.toString(), placement]));
    const agreementsByPlacementId = new Map(
      placementAgreements.map((agreement) => [agreement.placement.toString(), agreement])
    );
    const supportTicketsById = new Map(learnerSupportTickets.map((ticket) => [ticket._id.toString(), ticket]));
    const evaluationsById = new Map(evaluations.map((evaluation) => [evaluation._id.toString(), evaluation]));
    const evidenceTimeline = evidenceDocuments.map((document) => {
      const placement = document.placement ? placementsById.get(document.placement.toString()) : null;
      const supportTicket = document.supportTicket ? supportTicketsById.get(document.supportTicket.toString()) : null;
      const evaluation = document.employerEvaluation ? evaluationsById.get(document.employerEvaluation.toString()) : null;

      let sourceType = 'Learner Document';
      let sourceLabel = document.category;
      if (supportTicket) {
        sourceType = supportTicket.ticketType === 'Incident' ? 'Incident Evidence' : 'Support Evidence';
        sourceLabel = supportTicket.subject;
      } else if (evaluation) {
        sourceType = 'Evaluation Evidence';
        sourceLabel = evaluation.partner?.name ? `Employer evaluation · ${evaluation.partner.name}` : 'Employer evaluation';
      } else if (placement) {
        sourceType = 'Placement Document';
        sourceLabel = placement.companyName;
      }

      return {
        ...document,
        sourceType,
        sourceLabel,
        placementId: placement?._id || null,
        supportTicketId: supportTicket?._id || null,
        employerEvaluationId: evaluation?._id || null,
      };
    });

    // 3. Aggregate and Return
    res.json({
      learner,
      readiness: buildLearnerReadiness(learner, documents),
      placements: placements.map((placement) => ({
        ...placement.toObject(),
        operationalReadiness: buildPlacementOperationalReadiness(placement),
        agreementSummary: buildPlacementAgreementSummary({
          placement,
          learner,
          agreement: agreementsByPlacementId.get(placement._id.toString()) || null,
        }),
      })),
      placementHistory: buildPlacementHistory(placements),
      visits,
      semesterReports: reports,
      assessments,
      evaluations,
      linkedGuardians,
      guardianConsent: buildGuardianConsentSummary({
        learner,
        placement: activePlacement,
        consentRecord: activeConsentRecord,
      }),
      activePlacementManagement,
      evidenceTimeline,
    });
  } catch (error) {
    console.error("Error fetching learner profile:", error);
    res.status(500).json({ message: 'Server Error while fetching profile', detail: error.toString() });
  }
});

// ==================== GUARDIAN PORTAL ====================

router.post('/guardian-portal/consent-forms', requireRole('Guardian'), async (req, res) => {
  try {
    const learnerIds = await getGuardianLearnerIds(req.user);
    const {
      learnerId,
      learnerDeclaration,
      guardianFullName,
      contactNumber,
      relationshipToLearner,
      signatureName,
    } = req.body;

    if (!learnerId || !guardianFullName || !contactNumber || !relationshipToLearner || !signatureName) {
      return res.status(400).json({ message: 'Learner, guardian identity, relationship, contact number, and signature are required' });
    }

    const learner = await Learner.findById(learnerId).lean();
    if (!learner || !learnerIds.includes(learner._id.toString())) {
      return res.status(404).json({ message: 'Learner not found or not linked to your account' });
    }

    if (!learner.dateOfBirth) {
      return res.status(400).json({ message: 'This learner has no date of birth on record, so under-18 consent cannot be processed yet' });
    }

    if (!isLearnerUnder18(learner)) {
      return res.status(400).json({ message: 'This learner is not under 18 and does not require parent or guardian consent' });
    }

    const placements = await Placement.find({ learner: learner._id })
      .sort({ startDate: -1, createdAt: -1 })
      .lean();
    const placement = placements.find((entry) => entry.status === 'Active') || placements[0] || null;

    if (!placement) {
      return res.status(400).json({ message: 'A placement must exist before consent can be signed' });
    }

    const normalizedDeclaration = {
      understandsProgram: Boolean(learnerDeclaration?.understandsProgram),
      followRules: Boolean(learnerDeclaration?.followRules),
      respectfulResponsible: Boolean(learnerDeclaration?.respectfulResponsible),
      reportProblems: Boolean(learnerDeclaration?.reportProblems),
    };

    if (!Object.values(normalizedDeclaration).every(Boolean)) {
      return res.status(400).json({ message: 'All learner declaration acknowledgements must be confirmed before signing' });
    }

    const consentPayload = {
      learner: learner._id,
      placement: placement._id,
      institution: learner.institution,
      academicYear: placement.academicYear || resolveAcademicYearFromDate(placement.startDate),
      learnerSnapshot: {
        fullName: learner.name,
        dateOfBirth: learner.dateOfBirth,
        program: learner.program || '',
      },
      placementSnapshot: {
        industryName: placement.companyName,
        startDate: placement.startDate || null,
        endDate: placement.endDate || null,
      },
      learnerDeclaration: normalizedDeclaration,
      guardianDetails: {
        fullName: guardianFullName.trim(),
        contactNumber: contactNumber.trim(),
        relationshipToLearner: relationshipToLearner.trim(),
        signatureName: signatureName.trim(),
      },
      signedAt: new Date(),
      signedByUser: req.user._id,
    };

    const existing = await GuardianConsent.findOne({ learner: learner._id, placement: placement._id });
    let consentRecord;
    if (existing) {
      const before = existing.toObject();
      Object.assign(existing, consentPayload);
      await existing.save();
      consentRecord = existing;
      await logAuditEvent({
        req,
        action: 'UPDATE',
        entityType: 'GuardianConsent',
        entityId: consentRecord._id,
        summary: `Updated guardian consent for ${learner.name}`,
        before,
        after: consentRecord,
      });
    } else {
      consentRecord = await GuardianConsent.create(consentPayload);
      await logAuditEvent({
        req,
        action: 'CREATE',
        entityType: 'GuardianConsent',
        entityId: consentRecord._id,
        summary: `Signed guardian consent for ${learner.name}`,
        after: consentRecord,
      });
    }

    await notifyUsers({
      institution: learner.institution,
      roles: ['Admin', 'Manager', 'Staff'],
      sender: req.user._id,
      type: 'report',
      title: 'Guardian Consent Signed',
      message: `${req.user.name} signed the under-18 WEL consent form for ${learner.name}.`,
      link: `/learners/${learner._id}`,
    });

    res.status(existing ? 200 : 201).json(consentRecord);
  } catch (error) {
    console.error('Error signing guardian consent form:', error);
    res.status(500).json({ message: 'Error signing guardian consent form' });
  }
});

router.get('/guardian-portal/dashboard', requireRole('Guardian'), async (req, res) => {
  try {
    const learnerIds = await getGuardianLearnerIds(req.user);

    const [learners, placements, attendanceLogs, visits, assessments, evaluations, consentForms, notifications, tickets] = await Promise.all([
      Learner.find({ _id: { $in: learnerIds } })
        .select('firstName lastName middleName trackingId institution program year academicStatus status guardianContact dateOfBirth')
        .sort({ lastName: 1, firstName: 1 })
        .lean(),
      Placement.find({ learner: { $in: learnerIds } })
        .populate('partner', 'name')
        .sort({ startDate: -1, createdAt: -1 })
        .lean(),
      AttendanceLog.find({ learner: { $in: learnerIds } })
        .populate('placement', 'companyName')
        .sort({ periodEnd: -1, createdAt: -1 })
        .lean(),
      MonitoringVisit.find({ learner: { $in: learnerIds } })
        .sort({ visitDate: -1 })
        .lean(),
      CompetencyAssessment.find({ learner: { $in: learnerIds } })
        .sort({ assessmentDate: -1 })
        .lean(),
      EmployerEvaluation.find({ learner: { $in: learnerIds } })
        .populate('partner', 'name')
        .sort({ evaluationDate: -1 })
        .lean(),
      GuardianConsent.find({ learner: { $in: learnerIds } })
        .sort({ signedAt: -1, createdAt: -1 })
        .lean(),
      Notification.find({ recipient: req.user._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      SupportTicket.find({ requester: req.user._id })
        .populate('learner', 'name trackingId')
        .populate('placement', 'companyName status')
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const placementsByLearner = new Map();
    placements.forEach((placement) => {
      const key = placement.learner?.toString();
      if (!key) return;
      const existing = placementsByLearner.get(key) || [];
      existing.push(placement);
      placementsByLearner.set(key, existing);
    });

    const attendanceByLearner = new Map();
    attendanceLogs.forEach((log) => {
      const key = log.learner?.toString();
      if (!key) return;
      const existing = attendanceByLearner.get(key) || [];
      existing.push(log);
      attendanceByLearner.set(key, existing);
    });

    const visitsByLearner = new Map();
    visits.forEach((visit) => {
      const key = visit.learner?.toString();
      if (!key) return;
      const existing = visitsByLearner.get(key) || [];
      existing.push(visit);
      visitsByLearner.set(key, existing);
    });

    const assessmentsByLearner = new Map();
    assessments.forEach((assessment) => {
      const key = assessment.learner?.toString();
      if (!key) return;
      const existing = assessmentsByLearner.get(key) || [];
      existing.push(assessment);
      assessmentsByLearner.set(key, existing);
    });

    const evaluationsByLearner = new Map();
    evaluations.forEach((evaluation) => {
      const key = evaluation.learner?.toString();
      if (!key) return;
      const existing = evaluationsByLearner.get(key) || [];
      existing.push(evaluation);
      evaluationsByLearner.set(key, existing);
    });

    const consentByLearner = new Map();
    consentForms.forEach((consent) => {
      const key = consent.learner?.toString();
      if (!key) return;
      const existing = consentByLearner.get(key) || [];
      existing.push(consent);
      consentByLearner.set(key, existing);
    });

    const learnerCards = learners.map((learner) => {
      const learnerName = [learner.firstName, learner.middleName, learner.lastName]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim() || learner.name || 'Unknown Learner';
      const learnerPlacements = placementsByLearner.get(learner._id.toString()) || [];
      const currentPlacement = learnerPlacements.find((placement) => placement.status === 'Active') || learnerPlacements[0] || null;
      const learnerConsentForms = consentByLearner.get(learner._id.toString()) || [];
      const currentConsent = currentPlacement
        ? learnerConsentForms.find((consent) => consent.placement?.toString() === currentPlacement._id.toString()) || learnerConsentForms[0] || null
        : learnerConsentForms[0] || null;
      const learnerAttendance = attendanceByLearner.get(learner._id.toString()) || [];
      const latestAttendance = learnerAttendance[0] || null;
      const learnerVisits = visitsByLearner.get(learner._id.toString()) || [];
      const latestVisit = learnerVisits[0] || null;
      const learnerAssessments = assessmentsByLearner.get(learner._id.toString()) || [];
      const latestAssessment = learnerAssessments[0] || null;
      const learnerEvaluations = evaluationsByLearner.get(learner._id.toString()) || [];
      const latestEvaluation = learnerEvaluations[0] || null;

      return {
        learner: {
          ...learner,
          name: learnerName,
        },
        age: calculateAgeYears(learner.dateOfBirth),
        requiresGuardianConsent: isLearnerUnder18(learner),
        consentForm: buildGuardianConsentSummary({
          learner,
          placement: currentPlacement,
          consentRecord: currentConsent,
        }),
        currentPlacement,
        placementHistory: buildPlacementHistory(learnerPlacements),
        attendanceSummary: {
          totalHours: learnerAttendance.reduce((sum, log) => sum + (log.hoursWorked || 0), 0),
          latestEntry: latestAttendance,
          pendingEntries: learnerAttendance.filter((log) => log.status === 'Pending').length,
          rejectedEntries: learnerAttendance.filter((log) => log.status === 'Rejected').length,
          signedOffEntries: learnerAttendance.filter((log) => log.status === 'SignedOff').length,
        },
        monitoringSummary: {
          latestVisit,
          totalVisits: learnerVisits.length,
        },
        assessmentSummary: {
          latestAssessment,
          totalAssessments: learnerAssessments.length,
        },
        employerEvaluationSummary: {
          latestEvaluation,
          totalEvaluations: learnerEvaluations.length,
        },
      };
    });

    res.json({
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone || '',
      },
      learners: learnerCards,
      notifications,
      tickets,
      unreadNotificationCount: notifications.filter((notification) => !notification.read).length,
    });
  } catch (error) {
    console.error('Error fetching guardian portal dashboard:', error);
    res.status(500).json({ message: 'Error fetching guardian dashboard' });
  }
});

// ==================== LEARNER PROGRESS TRACKING ====================

// Progress milestone weights
const PROGRESS_MILESTONES = {
  REGISTERED: { weight: 10, key: 'registered', label: 'Registered' },
  PLACED: { weight: 15, key: 'placed', label: 'Placed' },
  FIRST_MONITORING_VISIT: { weight: 10, key: 'firstVisit', label: 'First Monitoring Visit' },
  FIRST_COMPETENCY_ASSESSMENT: { weight: 15, key: 'firstAssessment', label: 'Competency Assessment' },
  EMPLOYER_EVALUATION: { weight: 15, key: 'employerEval', label: 'Employer Evaluation' },
  MIDPOINT_CHECK: { weight: 10, key: 'midpoint', label: 'Midpoint Check' },
  FINAL_ASSESSMENT: { weight: 15, key: 'finalAssessment', label: 'Final Assessment' },
  COMPLETED: { weight: 10, key: 'completed', label: 'Completed' },
};

// Helper: Calculate progress for a single learner
const calculateLearnerProgress = (learner, placements, visits, assessments, evaluations, semesterReports) => {
  const progress = {
    overall: 0,
    completedMilestones: [],
    pendingMilestones: [],
    categoryBreakdown: {
      placement: 0,
      assessment: 0,
      monitoring: 0,
      documentation: 0,
    },
    atRisk: false,
    atRiskReasons: [],
    placementProgress: null,
  };

  let totalWeight = 0;
  let earnedWeight = 0;

  // Milestone 1: Registered (always completed if learner exists)
  progress.completedMilestones.push({
    ...PROGRESS_MILESTONES.REGISTERED,
    completedAt: learner.createdAt,
  });
  earnedWeight += PROGRESS_MILESTONES.REGISTERED.weight;
  totalWeight += PROGRESS_MILESTONES.REGISTERED.weight;

  // Milestone 2: Placed
  if (learner.status === 'Placed' || learner.status === 'Completed' || placements.length > 0) {
    const placement = placements[0];
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.PLACED,
      completedAt: placement?.startDate || learner.updatedAt,
      details: { companyName: placement?.companyName, sector: placement?.sector },
    });
    earnedWeight += PROGRESS_MILESTONES.PLACED.weight;
    progress.categoryBreakdown.placement = 100;
  } else {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.PLACED);
  }
  totalWeight += PROGRESS_MILESTONES.PLACED.weight;

  // Milestone 3: First Monitoring Visit
  if (visits.length > 0) {
    const firstVisit = visits.reduce((min, v) => v.visitDate < min.visitDate ? v : min, visits[0]);
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.FIRST_MONITORING_VISIT,
      completedAt: firstVisit.visitDate,
      details: { visitType: firstVisit.visitType, performanceRating: firstVisit.performanceRating },
    });
    earnedWeight += PROGRESS_MILESTONES.FIRST_MONITORING_VISIT.weight;
    progress.categoryBreakdown.monitoring = Math.min(100, (visits.length / 2) * 100); // Assume 2 visits expected
  } else if (learner.status === 'Placed' || learner.status === 'Completed') {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.FIRST_MONITORING_VISIT);
  }
  totalWeight += PROGRESS_MILESTONES.FIRST_MONITORING_VISIT.weight;

  // Milestone 4: First Competency Assessment
  if (assessments.length > 0) {
    const firstAssessment = assessments.reduce((min, a) => a.assessmentDate < min.assessmentDate ? a : min, assessments[0]);
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.FIRST_COMPETENCY_ASSESSMENT,
      completedAt: firstAssessment.assessmentDate,
      details: { overallScore: firstAssessment.overallScore, assessmentType: firstAssessment.assessmentType },
    });
    earnedWeight += PROGRESS_MILESTONES.FIRST_COMPETENCY_ASSESSMENT.weight;
    progress.categoryBreakdown.assessment = Math.min(100, (assessments.length / 2) * 100); // Assume 2 assessments expected
  } else if (learner.status === 'Placed' || learner.status === 'Completed') {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.FIRST_COMPETENCY_ASSESSMENT);
  }
  totalWeight += PROGRESS_MILESTONES.FIRST_COMPETENCY_ASSESSMENT.weight;

  // Milestone 5: Employer Evaluation
  if (evaluations.length > 0) {
    const firstEval = evaluations.reduce((min, e) => e.evaluationDate < min.evaluationDate ? e : min, evaluations[0]);
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.EMPLOYER_EVALUATION,
      completedAt: firstEval.evaluationDate,
      details: { overallScore: firstEval.overallScore, wouldHire: firstEval.wouldHire },
    });
    earnedWeight += PROGRESS_MILESTONES.EMPLOYER_EVALUATION.weight;
  } else if (learner.status === 'Placed' || learner.status === 'Completed') {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.EMPLOYER_EVALUATION);
  }
  totalWeight += PROGRESS_MILESTONES.EMPLOYER_EVALUATION.weight;

  // Milestone 6: Midpoint Check (based on placement duration)
  const currentPlacement = placements.find(p => p.status === 'Active');
  if (currentPlacement && currentPlacement.startDate) {
    const startDate = new Date(currentPlacement.startDate);
    const endDate = currentPlacement.endDate ? new Date(currentPlacement.endDate) : null;
    const today = new Date();
    const totalDuration = endDate ? endDate - startDate : 90 * 24 * 60 * 60 * 1000; // Default 90 days
    const elapsed = today - startDate;
    const progress_percent = Math.min(100, (elapsed / totalDuration) * 100);

    progress.placementProgress = {
      startDate: startDate,
      endDate: endDate,
      elapsedDays: Math.floor(elapsed / (1000 * 60 * 60 * 24)),
      totalDays: Math.floor(totalDuration / (1000 * 60 * 60 * 24)),
      remainingDays: Math.max(0, Math.floor((totalDuration - elapsed) / (1000 * 60 * 60 * 24))),
      percent: Math.round(progress_percent),
    };

    if (progress_percent >= 50) {
      progress.completedMilestones.push({
        ...PROGRESS_MILESTONES.MIDPOINT_CHECK,
        completedAt: new Date(startDate.getTime() + (totalDuration * 0.5)),
      });
      earnedWeight += PROGRESS_MILESTONES.MIDPOINT_CHECK.weight;
    } else {
      progress.pendingMilestones.push(PROGRESS_MILESTONES.MIDPOINT_CHECK);
    }

    // At-risk check: if progress is significantly behind
    const expectedProgress = 50; // Should be at 50% by midpoint
    if (progress_percent < expectedProgress - 20) {
      progress.atRisk = true;
      progress.atRiskReasons.push('Placement duration behind schedule');
    }
  }
  totalWeight += PROGRESS_MILESTONES.MIDPOINT_CHECK.weight;

  // Milestone 7: Final Assessment
  if (learner.status === 'Completed' && assessments.length > 1) {
    const finalAssessment = assessments.reduce((max, a) => a.assessmentDate > max.assessmentDate ? a : max, assessments[0]);
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.FINAL_ASSESSMENT,
      completedAt: finalAssessment.assessmentDate,
      details: { overallScore: finalAssessment.overallScore },
    });
    earnedWeight += PROGRESS_MILESTONES.FINAL_ASSESSMENT.weight;
  } else if (learner.status === 'Completed') {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.FINAL_ASSESSMENT);
  } else if (progress.placementProgress && progress.placementProgress.percent >= 80) {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.FINAL_ASSESSMENT);
  }
  totalWeight += PROGRESS_MILESTONES.FINAL_ASSESSMENT.weight;

  // Milestone 8: Completed
  if (learner.status === 'Completed') {
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.COMPLETED,
      completedAt: learner.updatedAt,
    });
    earnedWeight += PROGRESS_MILESTONES.COMPLETED.weight;
  }
  totalWeight += PROGRESS_MILESTONES.COMPLETED.weight;

  // Documentation progress (semester reports)
  progress.categoryBreakdown.documentation = semesterReports.length > 0 ? Math.min(100, semesterReports.length * 50) : 0;

  // Calculate overall progress percentage
  progress.overall = Math.round((earnedWeight / totalWeight) * 100);

  // Additional at-risk checks
  if (learner.status === 'Dropped') {
    progress.atRisk = true;
    progress.atRiskReasons.push('Learner status is Dropped');
  }

  if (assessments.length > 0) {
    const avgScore = assessments.reduce((sum, a) => sum + (a.overallScore || 0), 0) / assessments.length;
    if (avgScore < 2.5) {
      progress.atRisk = true;
      progress.atRiskReasons.push('Low assessment scores');
    }
  }

  if (evaluations.length > 0 && !evaluations[0].wouldHire) {
    progress.atRisk = true;
    progress.atRiskReasons.push('Employer would not re-hire');
  }

  return progress;
};

// GET /api/learners/:id/progress - Get progress for a single learner
router.get('/learners/:id/progress', async (req, res) => {
  try {
    const filter = await getFilter(req.user);

    // Fetch learner
    const learner = await Learner.findOne({ _id: req.params.id, ...filter });
    if (!learner) {
      return res.status(404).json({ message: 'Learner not found or unauthorized' });
    }

    // Fetch related records
    const placements = await Placement.find({ learner: req.params.id }).sort({ startDate: -1 });
    const visits = await MonitoringVisit.find({ learner: req.params.id }).sort({ visitDate: -1 });
    const assessments = await CompetencyAssessment.find({ learner: req.params.id }).sort({ assessmentDate: -1 });
    const evaluations = await EmployerEvaluation.find({ learner: req.params.id }).sort({ evaluationDate: -1 });
    const semesterReports = await SemesterReport.find({ institution: learner.institution }).sort({ createdAt: -1 });

    // Calculate progress
    const progress = calculateLearnerProgress(learner, placements, visits, assessments, evaluations, semesterReports);

    res.json({
      learner: {
        _id: learner._id,
        name: learner.name,
        trackingId: learner.trackingId,
        status: learner.status,
        program: learner.program,
        year: learner.year,
      },
      progress,
    });
  } catch (error) {
    console.error("Error fetching learner progress:", error);
    res.status(500).json({ message: 'Server Error while fetching progress', detail: error.toString() });
  }
});

// GET /api/learners/progress/bulk - Get progress summary for multiple learners
router.get('/learners/progress/bulk', async (req, res) => {
  try {
    const filter = await getFilter(req.user);
    const { program, year, status, academicStatus, intakeAcademicYear } = req.query;

    // Build query
    const query = { ...filter };
    if (program) query.program = program;
    if (year) query.year = year;
    if (status) query.status = status;
    if (academicStatus === 'CurrentEnrolled') query.academicStatus = { $in: ['Active', 'Graduating'] };
    else if (academicStatus) query.academicStatus = academicStatus;
    if (intakeAcademicYear) query.intakeAcademicYear = intakeAcademicYear;

    // Fetch learners
    const learners = await Learner.find(query)
      .populate('owner', 'name role institution')
      .sort({ createdAt: -1 });

    // Fetch all related data in bulk
    const learnerIds = learners.map(l => l._id);
    const placements = await Placement.find({ learner: { $in: learnerIds } });
    const visits = await MonitoringVisit.find({ learner: { $in: learnerIds } });
    const assessments = await CompetencyAssessment.find({ learner: { $in: learnerIds } });
    const evaluations = await EmployerEvaluation.find({ learner: { $in: learnerIds } });

    // Get unique institutions for semester reports
    const institutions = [...new Set(learners.map(l => l.institution))];
    const semesterReports = await SemesterReport.find({ institution: { $in: institutions } });

    // Calculate progress for each learner
    const progressSummary = learners.map(learner => {
      const learnerPlacements = placements.filter(p => p.learner.toString() === learner._id.toString());
      const learnerVisits = visits.filter(v => v.learner.toString() === learner._id.toString());
      const learnerAssessments = assessments.filter(a => a.learner.toString() === learner._id.toString());
      const learnerEvaluations = evaluations.filter(e => e.learner.toString() === learner._id.toString());
      const learnerReports = semesterReports.filter(r => r.institution === learner.institution);

      const progress = calculateLearnerProgress(
        learner,
        learnerPlacements,
        learnerVisits,
        learnerAssessments,
        learnerEvaluations,
        learnerReports
      );

      return {
        learner: {
          _id: learner._id,
          name: learner.name,
          trackingId: learner.trackingId,
          status: learner.status,
          academicStatus: learner.academicStatus || 'Active',
          program: learner.program,
          year: learner.year,
          intakeAcademicYear: learner.intakeAcademicYear || '',
          owner: learner.owner
            ? {
                _id: learner.owner._id,
                name: learner.owner.name,
                role: learner.owner.role,
                institution: learner.owner.institution,
              }
            : null,
        },
        progress: {
          overall: progress.overall,
          atRisk: progress.atRisk,
          atRiskReasons: progress.atRiskReasons,
          categoryBreakdown: progress.categoryBreakdown,
        },
      };
    });

    // Aggregate statistics
    const stats = {
      totalLearners: progressSummary.length,
      averageProgress: progressSummary.length > 0
        ? Math.round(progressSummary.reduce((sum, p) => sum + p.progress.overall, 0) / progressSummary.length)
        : 0,
      atRiskCount: progressSummary.filter(p => p.progress.atRisk).length,
      completedCount: progressSummary.filter(p => p.learner.status === 'Completed').length,
      placedCount: progressSummary.filter(p => p.learner.status === 'Placed').length,
      academicSummary: {
        currentEnrolled: progressSummary.filter((p) => ['Active', 'Graduating'].includes(p.learner.academicStatus)).length,
        activeCount: progressSummary.filter((p) => p.learner.academicStatus === 'Active').length,
        graduatingCount: progressSummary.filter((p) => p.learner.academicStatus === 'Graduating').length,
        graduatedCount: progressSummary.filter((p) => p.learner.academicStatus === 'Graduated').length,
        academicDroppedCount: progressSummary.filter((p) => p.learner.academicStatus === 'Dropped').length,
      },
      intakeCohorts: progressSummary.reduce((acc, item) => {
        const intakeAcademicYear = item.learner.intakeAcademicYear || 'Unspecified';
        if (!acc[intakeAcademicYear]) {
          acc[intakeAcademicYear] = {
            intakeAcademicYear,
            totalLearners: 0,
            currentEnrolled: 0,
            graduating: 0,
            graduated: 0,
            dropped: 0,
            avgProgress: 0,
            atRiskCount: 0,
            placed: 0,
            completed: 0,
          };
        }

        acc[intakeAcademicYear].totalLearners += 1;
        acc[intakeAcademicYear].avgProgress += item.progress.overall;
        if (['Active', 'Graduating'].includes(item.learner.academicStatus)) acc[intakeAcademicYear].currentEnrolled += 1;
        if (item.learner.academicStatus === 'Graduating') acc[intakeAcademicYear].graduating += 1;
        if (item.learner.academicStatus === 'Graduated') acc[intakeAcademicYear].graduated += 1;
        if (item.learner.academicStatus === 'Dropped') acc[intakeAcademicYear].dropped += 1;
        if (item.learner.status === 'Placed') acc[intakeAcademicYear].placed += 1;
        if (item.learner.status === 'Completed') acc[intakeAcademicYear].completed += 1;
        if (item.progress.atRisk) acc[intakeAcademicYear].atRiskCount += 1;
        return acc;
      }, {}),
    };

    stats.intakeCohorts = Object.values(stats.intakeCohorts)
      .map((cohort) => withCohortRiskMeta({
        ...cohort,
        avgProgress: cohort.totalLearners > 0 ? Math.round(cohort.avgProgress / cohort.totalLearners) : 0,
      }))
      .sort((a, b) => b.intakeAcademicYear.localeCompare(a.intakeAcademicYear));

    res.json({
      learners: progressSummary,
      stats,
    });
  } catch (error) {
    console.error("Error fetching bulk progress:", error);
    res.status(500).json({ message: 'Server Error while fetching bulk progress', detail: error.toString() });
  }
});

// ==================== PLACEMENTS ====================

router.get('/placements/export', async (req, res) => {
  try {
    const filter = await getPlacementScope(req.user);
    const placements = await Placement.find(filter)
        .populate('learner')
        .sort({ startDate: -1 });

    const mappedData = placements.map(p => ({
        'Learner Name': p.learner?.name || 'Unknown',
        'Tracking ID': p.learner?.trackingId || 'N/A',
        'Program': p.learner?.program || 'N/A',
        'Study Year': p.learner?.year || 'N/A',
        'Intake Academic Year': p.learner?.intakeAcademicYear || 'N/A',
        'Academic Status': p.learner?.academicStatus || 'Active',
        'WEL Status': p.learner?.status || 'Pending',
        'Institution': p.institution || 'N/A',
        'Company Name': p.companyName,
        'Sector': p.sector,
        'Location': p.location,
        'Supervisor Name': p.supervisorName,
        'Supervisor Email': p.supervisorEmail || 'N/A',
        'Start Date': new Date(p.startDate).toLocaleDateString(),
        'End Date': new Date(p.endDate).toLocaleDateString(),
        'Placement Status': p.status
    }));

    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(mappedData);

    res.header('Content-Type', 'text/csv');
    res.attachment('Placements_Export.csv');
    return res.send(csv);
  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({ message: 'Error exporting placements', error: error.message });
  }
});

router.get('/placements', async (req, res) => {
  try {
    const filter = await getPlacementScope(req.user);
    const placements = await Placement.find(filter)
      .populate('learner')
      .populate('owner', 'name role institution')
      .populate('partner', 'name')
      .populate('delegate', 'name role institution');

    const placementIds = placements.map((placement) => placement._id);
    const learnerIds = placements.map((p) => p.learner?._id).filter(Boolean);
    const partnerIds = [...new Set(placements.map((p) => p.partner?._id?.toString()).filter(Boolean))];
    const institutions = [...new Set(placements.map((p) => p.institution).filter(Boolean))];

    // Bulk-fetch all related data for health scoring in parallel
    const [messages, allAttendance, allVisits, allAssessments, openTickets, supportTickets, evaluations, directDocuments] = await Promise.all([
      PlacementMessage.find({ placement: { $in: placementIds } }).select('placement createdAt senderUser readBy').lean(),
      AttendanceLog.find({ placement: { $in: placementIds } }).select('placement learner periodEnd status').lean(),
      MonitoringVisit.find({ learner: { $in: learnerIds } }).select('learner visitDate').lean(),
      CompetencyAssessment.find({ learner: { $in: learnerIds } }).select('learner assessmentDate').lean(),
      (partnerIds.length > 0 || institutions.length > 0)
        ? SupportTicket.find({
            status: { $in: ['Open', 'InProgress'] },
            $or: [
              ...(partnerIds.length > 0 ? [{ partnerId: { $in: partnerIds } }] : []),
              ...(institutions.length > 0 ? [{ institution: { $in: institutions } }] : []),
            ],
          }).select('partnerId institution').lean()
        : Promise.resolve([]),
      SupportTicket.find({ placement: { $in: placementIds } }).select('_id placement').lean(),
      EmployerEvaluation.find({ learner: { $in: learnerIds } }).select('_id learner').lean(),
      Document.find({
        $or: [
          { placement: { $in: placementIds } },
          { learner: { $in: learnerIds } },
        ],
      }).select('_id placement learner supportTicket employerEvaluation').lean(),

    ]);

    const msgStatsMap = new Map();
    messages.forEach((message) => {
      const key = message.placement.toString();
      const current = msgStatsMap.get(key) || { messageCount: 0, lastMessageAt: null, unreadCount: 0 };
      current.messageCount += 1;
      if (!current.lastMessageAt || new Date(message.createdAt) > new Date(current.lastMessageAt)) {
        current.lastMessageAt = message.createdAt;
      }

      const hasRead = (message.readBy || []).some((readerId) => readerId.toString() === req.user._id.toString());
      const isOwnMessage = message.senderUser?.toString() === req.user._id.toString();
      if (!isOwnMessage && !hasRead) {
        current.unreadCount += 1;
      }

      msgStatsMap.set(key, current);
    });

    // Index related data by placement/learner for O(1) lookups
    const attendanceByPlacement = new Map();
    allAttendance.forEach((log) => {
      const key = log.placement.toString();
      if (!attendanceByPlacement.has(key)) attendanceByPlacement.set(key, []);
      attendanceByPlacement.get(key).push(log);
    });

    const visitsByLearner = new Map();
    allVisits.forEach((v) => {
      const key = v.learner.toString();
      if (!visitsByLearner.has(key)) visitsByLearner.set(key, []);
      visitsByLearner.get(key).push(v);
    });

    const assessmentsByLearner = new Map();
    allAssessments.forEach((a) => {
      const key = a.learner.toString();
      if (!assessmentsByLearner.has(key)) assessmentsByLearner.set(key, []);
      assessmentsByLearner.get(key).push(a);
    });

    const supportTicketsByPlacement = new Map();
    supportTickets.forEach((ticket) => {
      const key = ticket.placement?.toString();
      if (!key) return;
      if (!supportTicketsByPlacement.has(key)) supportTicketsByPlacement.set(key, []);
      supportTicketsByPlacement.get(key).push(ticket._id.toString());
    });

    const evaluationsByLearner = new Map();
    evaluations.forEach((evaluation) => {
      const key = evaluation.learner?.toString();
      if (!key) return;
      if (!evaluationsByLearner.has(key)) evaluationsByLearner.set(key, []);
      evaluationsByLearner.get(key).push(evaluation._id.toString());
    });

    const directPlacementDocCounts = new Map();
    const learnerDocCounts = new Map();
    const supportDocCounts = new Map();
    const evaluationDocCounts = new Map();
    directDocuments.forEach((doc) => {
      if (doc.placement) {
        const key = doc.placement.toString();
        directPlacementDocCounts.set(key, (directPlacementDocCounts.get(key) || 0) + 1);
      }
      if (doc.learner) {
        const key = doc.learner.toString();
        learnerDocCounts.set(key, (learnerDocCounts.get(key) || 0) + 1);
      }
      if (doc.supportTicket) {
        const key = doc.supportTicket.toString();
        supportDocCounts.set(key, (supportDocCounts.get(key) || 0) + 1);
      }
      if (doc.employerEvaluation) {
        const key = doc.employerEvaluation.toString();
        evaluationDocCounts.set(key, (evaluationDocCounts.get(key) || 0) + 1);
      }
    });

    // Count open tickets per partner and institution
    const ticketsByPartner = new Map();
    const ticketsByInstitution = new Map();
    openTickets.forEach((t) => {
      if (t.partnerId) {
        const key = t.partnerId.toString();
        ticketsByPartner.set(key, (ticketsByPartner.get(key) || 0) + 1);
      }
      if (t.institution) {
        ticketsByInstitution.set(t.institution, (ticketsByInstitution.get(t.institution) || 0) + 1);
      }
    });

    res.json(
      placements.map((placement) => {
        const placementJson = placement.toObject();
        const pid = placement._id.toString();
        const lid = placement.learner?._id?.toString();
        const partnerId = placement.partner?._id?.toString();
        const stats = msgStatsMap.get(pid);

        const openTicketCount = (partnerId ? (ticketsByPartner.get(partnerId) || 0) : 0)
          + (placement.institution ? (ticketsByInstitution.get(placement.institution) || 0) : 0);
        const placementSupportTickets = supportTicketsByPlacement.get(pid) || [];
        const placementEvaluations = lid ? (evaluationsByLearner.get(lid) || []) : [];
        const supportEvidenceCount = placementSupportTickets.reduce((sum, ticketId) => sum + (supportDocCounts.get(ticketId) || 0), 0);
        const evaluationEvidenceCount = placementEvaluations.reduce((sum, evaluationId) => sum + (evaluationDocCounts.get(evaluationId) || 0), 0);
        const learnerEvidenceCount = lid ? (learnerDocCounts.get(lid) || 0) : 0;
        const placementEvidenceCount = directPlacementDocCounts.get(pid) || 0;
        const uniqueEvidenceIds = new Set(
          directDocuments
            .filter((doc) =>
              doc.placement?.toString() === pid
              || (lid && doc.learner?.toString() === lid)
              || placementSupportTickets.includes(doc.supportTicket?.toString())
              || placementEvaluations.includes(doc.employerEvaluation?.toString())
            )
            .map((doc) => doc._id.toString())
        );

        const healthScore = calculatePlacementHealth(placementJson, {
          attendanceLogs: attendanceByPlacement.get(pid) || [],
          visits: lid ? (visitsByLearner.get(lid) || []) : [],
          assessments: lid ? (assessmentsByLearner.get(lid) || []) : [],
          openTicketCount,
        });

        return {
          ...placementJson,
          messageCount: stats?.messageCount || 0,
          lastMessageAt: stats?.lastMessageAt || null,
          unreadMessageCount: stats?.unreadCount || 0,
          operationalReadiness: buildPlacementOperationalReadiness(placementJson),
          evidenceCount: uniqueEvidenceIds.size,
          evidenceBreakdown: {
            placement: placementEvidenceCount,
            learner: learnerEvidenceCount,
            support: supportEvidenceCount,
            evaluation: evaluationEvidenceCount,
          },
          healthScore,
        };
      })
    );
  } catch (error) {
    console.error('Error fetching placements:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

router.get('/placements/:id/evidence', async (req, res) => {
  try {
    const placement = await findPlacementForUser(req.user, req.params.id);

    if (!placement) {
      return res.status(404).json({ message: 'Placement not found or unauthorized' });
    }

    const supportTickets = await SupportTicket.find({ placement: placement._id }).select('_id subject ticketType incidentType').lean();
    const evaluations = placement.learner?._id
      ? await EmployerEvaluation.find({ learner: placement.learner._id }).populate('partner', 'name').select('_id partner evaluationDate').lean()
      : [];

    const documents = await Document.find({
      $or: [
        { placement: placement._id },
        ...(placement.learner?._id ? [{ learner: placement.learner._id }] : []),
        { supportTicket: { $in: supportTickets.map((ticket) => ticket._id) } },
        { employerEvaluation: { $in: evaluations.map((evaluation) => evaluation._id) } },
      ],
    })
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const supportTicketsById = new Map(supportTickets.map((ticket) => [ticket._id.toString(), ticket]));
    const evaluationsById = new Map(evaluations.map((evaluation) => [evaluation._id.toString(), evaluation]));

    const evidence = documents.map((document) => {
      const supportTicket = document.supportTicket ? supportTicketsById.get(document.supportTicket.toString()) : null;
      const evaluation = document.employerEvaluation ? evaluationsById.get(document.employerEvaluation.toString()) : null;

      let sourceType = 'Placement Document';
      let sourceLabel = placement.companyName;
      if (supportTicket) {
        sourceType = supportTicket.ticketType === 'Incident' ? 'Incident Evidence' : 'Support Evidence';
        sourceLabel = supportTicket.subject;
      } else if (evaluation) {
        sourceType = 'Evaluation Evidence';
        sourceLabel = evaluation.partner?.name ? `Employer evaluation · ${evaluation.partner.name}` : 'Employer evaluation';
      } else if (document.learner) {
        sourceType = 'Learner Document';
        sourceLabel = placement.learner?.name || 'Learner record';
      }

      return {
        ...document,
        sourceType,
        sourceLabel,
      };
    });

    res.json({
      placement: {
        _id: placement._id,
        companyName: placement.companyName,
        learner: placement.learner,
      },
      evidence,
    });
  } catch (error) {
    console.error('Error fetching placement evidence:', error);
    res.status(500).json({ message: 'Error fetching placement evidence' });
  }
});


router.get('/placements/:id/messages', async (req, res) => {
  try {
    const placement = await findPlacementForUser(req.user, req.params.id);

    if (!placement) {
      return res.status(404).json({ message: 'Placement not found or unauthorized' });
    }

    await PlacementMessage.updateMany(
      {
        placement: placement._id,
        senderUser: { $ne: req.user._id },
        readBy: { $ne: req.user._id },
      },
      { $addToSet: { readBy: req.user._id } }
    );

    const messages = await PlacementMessage.find({ placement: placement._id })
      .populate('senderUser', 'name role institution profilePicture partnerId')
      .populate('replyTo', 'message senderName createdAt')
      .sort({ createdAt: 1 });

    res.json({
      placement,
      messages,
    });
  } catch (error) {
    console.error('Error fetching placement messages:', error);
    res.status(500).json({ message: 'Error fetching placement messages' });
  }
});

router.post('/placements/:id/learner-agreement-sign', async (req, res) => {
  try {
    const placement = await findPlacementForUser(req.user, req.params.id);

    if (!placement) {
      return res.status(404).json({ message: 'Placement not found or unauthorized' });
    }

    if (!['Admin', 'Manager', 'Staff', 'SuperAdmin', 'RegionalAdmin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only institution users can record learner agreement signatures' });
    }

    const { learnerName, signatureName } = req.body;
    if (!learnerName?.trim() || !signatureName?.trim()) {
      return res.status(400).json({ message: 'Learner name and signature are required' });
    }

    let agreement = await PlacementAgreement.findOne({ placement: placement._id });
    if (!agreement) {
      agreement = new PlacementAgreement({
        placement: placement._id,
        learner: placement.learner?._id || placement.learner,
        partner: placement.partner?._id || placement.partner || null,
        institution: placement.institution,
      });
    }

    const before = agreement.toObject();
    agreement.learnerAgreement = {
      signed: true,
      learnerName: learnerName.trim(),
      signatureName: signatureName.trim(),
      signedAt: new Date(),
      witnessedByUser: req.user._id,
    };
    await agreement.save();

    await logAuditEvent({
      req,
      action: before?._id ? 'UPDATE' : 'CREATE',
      entityType: 'PlacementAgreement',
      entityId: agreement._id,
      summary: `Recorded learner agreement signature for placement ${placement._id}`,
      before,
      after: agreement,
    });

    res.json({
      agreement,
      agreementSummary: buildPlacementAgreementSummary({
        placement,
        learner: placement.learner,
        agreement,
      }),
    });
  } catch (error) {
    console.error('Error signing learner agreement:', error);
    res.status(500).json({ message: 'Error signing learner agreement' });
  }
});

router.post('/placements/:id/messages', async (req, res) => {
  try {
    const placement = await findPlacementForUser(req.user, req.params.id);

    if (!placement) {
      return res.status(404).json({ message: 'Placement not found or unauthorized' });
    }

    const { message, replyTo } = req.body;
    const trimmedMessage = message?.trim();

    if (!trimmedMessage) {
      return res.status(400).json({ message: 'Message is required' });
    }

    let parentMessage = null;
    if (replyTo) {
      parentMessage = await PlacementMessage.findOne({ _id: replyTo, placement: placement._id });
      if (!parentMessage) {
        return res.status(400).json({ message: 'Reply target is invalid' });
      }
    }

    const placementMessage = await PlacementMessage.create({
      placement: placement._id,
      senderUser: req.user._id,
      senderName: req.user.name,
      senderRole: req.user.role,
      senderInstitution: req.user.institution || '',
      senderPartnerId: getPartnerId(req.user) || undefined,
      message: trimmedMessage,
      replyTo: parentMessage?._id || null,
      readBy: [req.user._id],
    });

    await logAuditEvent({
      req,
      action: 'CREATE',
      entityType: 'PlacementMessage',
      entityId: placementMessage._id,
      summary: `Added a placement message for placement ${placement._id}`,
      metadata: { placementId: placement._id, replyTo: parentMessage?._id || null },
      after: placementMessage,
    });

    const recipientQuery = [{ institution: placement.institution }];
    if (placement.partner?._id) {
      recipientQuery.push({ partnerId: placement.partner._id });
    }

    const recipients = await User.find({
      $or: recipientQuery,
      status: 'Active',
    }).select('_id');

    await notifyUsers({
      recipientIds: recipients.map((user) => user._id.toString()),
      sender: req.user._id,
      type: 'placement',
      title: 'New placement message',
      message: `${req.user.name} sent a message about ${placement.learner?.name || 'a learner'}'s placement at ${placement.companyName}.`,
      link: '/placements',
    });

    const populatedMessage = await PlacementMessage.findById(placementMessage._id)
      .populate('senderUser', 'name role institution profilePicture partnerId')
      .populate('replyTo', 'message senderName createdAt');

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Error creating placement message:', error);
    res.status(500).json({ message: 'Error creating placement message' });
  }
});

router.post('/placements', async (req, res) => {
    try {
        const { learner, learners, ...placementData } = req.body;
        const learnerIds = learners || (learner ? [learner] : []);
        const placementAcademicYear = placementData.academicYear || await resolveCurrentAcademicYear();

        if (learnerIds.length === 0) {
            return res.status(400).json({ message: 'At least one learner must be selected' });
        }

        const readinessCheck = await assertLearnersReadyForPlacement(learnerIds, req.user.institution);
        if (!readinessCheck.ok) {
            return res.status(400).json({ message: `Learner readiness check failed: ${readinessCheck.message}` });
        }

        const placementDocs = learnerIds.map(id => ({
            ...placementData,
            academicYear: placementAcademicYear,
            learner: id,
            institution: req.user.institution,
            owner: placementData.owner || undefined,
            status: 'Active'
        }));

        const createdPlacements = await Placement.insertMany(placementDocs);

        // Automatically update learner status to 'Placed'
        for (const placement of createdPlacements) {
            const updatedLearner = await Learner.findByIdAndUpdate(placement.learner, { 
                status: 'Placed',
                placement: placement._id
            }, { new: true });
            
            if (req.body.partner) {
                notifyUsers({
                    partnerId: req.body.partner,
                    sender: req.user._id,
                    type: 'placement',
                    title: 'New Placement',
                    message: `${updatedLearner?.name || 'A learner'} has been placed with your organization.`,
                    link: '/partner-dashboard?view=mine'
                });
            }
        }

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'Placement',
            entityId: createdPlacements.map((placement) => placement._id).join(','),
            summary: `Created ${createdPlacements.length} placement record(s)`,
            metadata: { placementIds: createdPlacements.map((placement) => placement._id), learnerIds },
            after: createdPlacements,
        });

        res.status(201).json(createdPlacements);
    } catch (error) {
        console.error("Error creating placement:", error);
        res.status(500).json({ message: 'Error creating placement' });
    }
});

router.put('/placements/:id', async (req, res) => {
    try {
        const existingPlacement = await Placement.findById(req.params.id);
        const payload = { ...req.body };
        if (!payload.academicYear && payload.startDate) {
            payload.academicYear = resolveAcademicYearFromDate(payload.startDate);
        }
        const updatedPlacement = await Placement.findByIdAndUpdate(req.params.id, payload, { returnDocument: 'after' });
        if (updatedPlacement && existingPlacement) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'Placement',
                entityId: updatedPlacement._id,
                summary: `Updated placement ${updatedPlacement._id}`,
                before: existingPlacement,
                after: updatedPlacement,
            });
        }
        res.json(updatedPlacement);
    } catch (error) {
        res.status(500).json({ message: 'Error updating placement' });
    }
});

router.put('/placements/:id/owner', async (req, res) => {
    try {
        if (!canManageOperationalOwnership(req.user)) {
            return res.status(403).json({ message: 'You do not have permission to assign placement owners' });
        }

        const filter = await getPlacementScope(req.user);
        const placement = await Placement.findOne({ _id: req.params.id, ...filter });
        if (!placement) {
            return res.status(404).json({ message: 'Placement not found or unauthorized' });
        }

        const { ownerId } = req.body;
        let owner = null;
        if (ownerId) {
            owner = await User.findOne({ _id: ownerId, institution: placement.institution, role: { $in: ['Admin', 'Manager', 'Staff'] } }).select('_id name role institution');
            if (!owner) {
                return res.status(400).json({ message: 'Selected owner is invalid for this placement' });
            }
        }

        const before = placement.toObject();
        placement.owner = owner?._id || undefined;
        await placement.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'Placement',
            entityId: placement._id,
            summary: `Updated operational owner for placement ${placement._id}`,
            before,
            after: placement,
            changedFields: ['owner'],
        });

        const populatedPlacement = await Placement.findById(placement._id)
            .populate('learner', 'name trackingId')
            .populate('partner', 'name')
            .populate('owner', 'name role institution');

        res.json(populatedPlacement);
    } catch (error) {
        console.error('Error updating placement owner:', error);
        res.status(500).json({ message: 'Error updating placement owner' });
    }
});

router.put('/placements/:id/partner-supervisor', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const placement = await Placement.findById(req.params.id).populate('partner', 'name');
        if (!placement) {
            return res.status(404).json({ message: 'Placement not found' });
        }

        const { supervisorId } = req.body;
        let supervisor = null;
        if (supervisorId) {
            supervisor = await User.findOne({
                _id: supervisorId,
                role: 'IndustryPartner',
                partnerId: placement.partner,
                status: 'Active',
            }).select('_id name email');

            if (!supervisor) {
                return res.status(400).json({ message: 'Selected supervisor is invalid for this placement' });
            }
        }

        const before = placement.toObject();
        placement.partnerSupervisor = supervisor?._id || null;
        await placement.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'Placement',
            entityId: placement._id,
            summary: `Updated partner supervisor for placement ${placement._id}`,
            before,
            after: placement,
            changedFields: ['partnerSupervisor'],
        });

        res.json(placement);
    } catch (error) {
        console.error('Error updating admin partner supervisor assignment:', error);
        res.status(500).json({ message: 'Error updating partner supervisor assignment' });
    }
});

// ==================== CROSS-REGION DELEGATION ====================

// Assign or remove a delegate on a placement
router.put('/placements/:id/delegate', async (req, res) => {
    try {
        const filter = await getPlacementScope(req.user);
        const placement = await Placement.findOne({ _id: req.params.id, ...filter })
            .populate('learner', 'name trackingId')
            .populate('owner', 'name institution');
        if (!placement) {
            return res.status(404).json({ message: 'Placement not found or unauthorized' });
        }

        // Only Admin, Manager, or RegionalAdmin can assign delegates
        if (!['Admin', 'Manager', 'SuperAdmin', 'RegionalAdmin'].includes(req.user.role)) {
            return res.status(403).json({ message: 'You do not have permission to assign delegates' });
        }

        const { delegateId } = req.body;
        const before = placement.toObject();

        if (!delegateId) {
            // Remove delegate
            placement.delegate = undefined;
            placement.delegatedAt = undefined;
            placement.delegatedBy = undefined;
            placement.delegateInstitution = undefined;
            await placement.save();

            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'Placement',
                entityId: placement._id,
                summary: `Removed delegate from placement ${placement._id}`,
                before,
                after: placement,
                changedFields: ['delegate', 'delegatedAt', 'delegatedBy', 'delegateInstitution'],
            });

            return res.json(placement);
        }

        // Validate delegate is a Staff/Manager/Admin at an institution in the placement region
        const placementRegion = placement.placementRegion;
        if (!placementRegion) {
            return res.status(400).json({ message: 'Placement region must be set before assigning a delegate. Please edit the placement and set the placement region.' });
        }

        const regionInstitutions = await Institution.find({ region: placementRegion }).select('name');
        const regionInstitutionNames = regionInstitutions.map(i => i.name);

        const delegateUser = await User.findOne({
            _id: delegateId,
            role: { $in: ['Admin', 'Manager', 'Staff'] },
            institution: { $in: regionInstitutionNames },
            status: 'Active',
        }).select('_id name role institution');

        if (!delegateUser) {
            return res.status(400).json({ message: 'Selected delegate must be an active staff member at an institution in the placement region' });
        }

        placement.delegate = delegateUser._id;
        placement.delegatedAt = new Date();
        placement.delegatedBy = req.user._id;
        placement.delegateInstitution = delegateUser.institution;
        await placement.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'Placement',
            entityId: placement._id,
            summary: `Assigned delegate ${delegateUser.name} for placement ${placement._id}`,
            before,
            after: placement,
            changedFields: ['delegate', 'delegatedAt', 'delegatedBy', 'delegateInstitution'],
        });

        // Notify the delegate
        await notifyUsers({
            recipientIds: [delegateUser._id.toString()],
            sender: req.user._id,
            type: 'visit',
            title: 'Cross-Region Delegation Assignment',
            message: `You have been assigned as the delegate supervisor for ${placement.learner?.name || 'a learner'} (${placement.learner?.trackingId || ''}) from ${placement.institution}. Please conduct monitoring visits at ${placement.companyName}.`,
            link: '/placements?view=delegated',
        });

        const populatedPlacement = await Placement.findById(placement._id)
            .populate('learner', 'name trackingId firstName lastName')
            .populate('partner', 'name sector region')
            .populate('delegate', 'name role institution')
            .populate('owner', 'name role institution');

        res.json(populatedPlacement);
    } catch (error) {
        console.error('Error updating placement delegate:', error);
        res.status(500).json({ message: 'Error updating placement delegate' });
    }
});

// Get placements delegated to the current user
router.get('/placements/delegated-to-me', async (req, res) => {
    try {
        const placements = await Placement.find({
            delegate: req.user._id,
            status: 'Active',
        })
            .populate('learner', 'name trackingId firstName lastName program region institution')
            .populate('partner', 'name sector region')
            .populate('owner', 'name role institution')
            .populate('delegatedBy', 'name role')
            .sort({ delegatedAt: -1 });

        res.json(placements);
    } catch (error) {
        console.error('Error fetching delegated placements:', error);
        res.status(500).json({ message: 'Error fetching delegated placements' });
    }
});

// Get users by region for delegate picker
router.get('/users/by-region/:region', async (req, res) => {
    try {
        const region = req.params.region;
        const regionInstitutions = await Institution.find({ region }).select('name');
        const regionInstitutionNames = regionInstitutions.map(i => i.name);

        const users = await User.find({
            role: { $in: ['Admin', 'Manager', 'Staff'] },
            institution: { $in: regionInstitutionNames },
            status: 'Active',
        })
            .select('_id name role institution')
            .sort({ institution: 1, name: 1 });

        res.json(users);
    } catch (error) {
        console.error('Error fetching users by region:', error);
        res.status(500).json({ message: 'Error fetching users by region' });
    }
});

router.delete('/placements/:id', async (req, res) => {
    try {
        const deletedPlacement = await Placement.findByIdAndDelete(req.params.id);
        if (deletedPlacement) {
            await logAuditEvent({
                req,
                action: 'DELETE',
                entityType: 'Placement',
                entityId: deletedPlacement._id,
                summary: `Deleted placement ${deletedPlacement._id}`,
                before: deletedPlacement,
            });
        }
        res.json({ message: 'Placement deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting placement' });
    }
});

// ==================== ATTENDANCE LOGS ====================

router.get('/attendance-logs', async (req, res) => {
    try {
        const scope = await buildAttendanceScope(req.user);
        const { learnerId, placementId, status, entryType } = req.query;
        const query = { ...scope };

        if (learnerId) query.learner = learnerId;
        if (placementId) query.placement = placementId;
        if (status) query.status = status;
        if (entryType) query.entryType = entryType;

        const logs = await AttendanceLog.find(query)
            .populate('learner', 'name trackingId program year')
            .populate('placement', 'companyName supervisorName supervisorEmail startDate endDate status')
            .populate('submittedBy', 'name role')
            .populate('signedOffBy', 'name role')
            .sort({ periodStart: -1, createdAt: -1 });

        res.json(logs);
    } catch (error) {
        console.error('Error fetching attendance logs:', error);
        res.status(500).json({ message: 'Error fetching attendance logs' });
    }
});

router.post('/attendance-logs', async (req, res) => {
    try {
        const { learner: learnerId, entryType, periodStart, periodEnd, hoursWorked, tasksCompleted, notes } = req.body;
        const validationError = validateAttendancePayload({ entryType, periodStart, periodEnd, hoursWorked });
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        let learner = null;
        let placement = null;

        if (req.user.role === 'IndustryPartner') {
            placement = await Placement.findOne({
                learner: learnerId,
                partner: getPartnerId(req.user),
                status: 'Active',
            })
                .populate('partnerSupervisor', 'name')
                .sort({ startDate: -1 });

            if (!placement) {
                return res.status(404).json({ message: 'Active learner placement not found for this partner' });
            }

            if (!canActOnPartnerPlacement(req.user, placement)) {
                return res.status(403).json({ message: `This learner is assigned to ${placement.partnerSupervisor?.name || 'another supervisor'}` });
            }

            learner = await Learner.findById(learnerId);
        } else {
            const filter = await getFilter(req.user);
            learner = await Learner.findOne({ _id: learnerId, ...filter });
            if (!learner) {
                return res.status(404).json({ message: 'Learner not found or unauthorized' });
            }

            placement = await Placement.findOne({ learner: learnerId, institution: learner.institution })
                .sort({ startDate: -1 });
        }

        if (!learner) {
            return res.status(404).json({ message: 'Learner not found or unauthorized' });
        }

        if (!placement) {
            return res.status(400).json({ message: 'Learner does not have a placement record yet' });
        }

        const newLog = await AttendanceLog.create({
            learner: learner._id,
            placement: placement._id,
            partner: placement.partner,
            institution: learner.institution,
            entryType,
            periodStart,
            periodEnd,
            hoursWorked,
            tasksCompleted,
            notes: notes || '',
            submittedBy: req.user._id,
            submittedSource: req.user.role === 'IndustryPartner' ? 'Partner' : 'Institution',
            status: req.user.role === 'IndustryPartner' ? 'SignedOff' : 'Pending',
            signedOffBy: req.user.role === 'IndustryPartner' ? req.user._id : undefined,
            signedOffAt: req.user.role === 'IndustryPartner' ? new Date() : undefined,
        });

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'AttendanceLog',
            entityId: newLog._id,
            summary: `Created ${entryType.toLowerCase()} attendance log for learner ${learner.name}`,
            after: newLog,
        });

        if (placement.partner && req.user.role !== 'IndustryPartner') {
            await notifyUsers({
                partnerId: placement.partner,
                sender: req.user._id,
                type: 'report',
                title: 'Hours awaiting sign-off',
                message: `${learner.name} has a new ${entryType.toLowerCase()} attendance entry ready for supervisor review.`,
                link: '/attendance-logs',
            });
        }

        if (req.user.role === 'IndustryPartner') {
            await notifyUsers({
                institution: learner.institution,
                roles: ['Admin', 'Manager', 'Staff'],
                sender: req.user._id,
                type: 'report',
                title: 'Supervisor-recorded attendance log',
                message: `${learner.name} has a new ${entryType.toLowerCase()} attendance entry recorded by the industry supervisor.`,
                link: '/attendance-logs',
            });
        }

        const populated = await AttendanceLog.findById(newLog._id)
            .populate('learner', 'name trackingId program')
            .populate('placement', 'companyName supervisorName supervisorEmail startDate endDate status')
            .populate('submittedBy', 'name role')
            .populate('signedOffBy', 'name role');

        res.status(201).json(populated);
    } catch (error) {
        console.error('Error creating attendance log:', error);
        res.status(500).json({ message: 'Error creating attendance log' });
    }
});

router.put('/attendance-logs/:id', async (req, res) => {
    try {
        const scope = await buildAttendanceScope(req.user);
        const attendanceLog = await AttendanceLog.findOne({ _id: req.params.id, ...scope });
        if (!attendanceLog) {
            return res.status(404).json({ message: 'Attendance log not found or unauthorized' });
        }
        const { clientUpdatedAt, ...requestBody } = req.body;

        if (req.user.role === 'IndustryPartner' && attendanceLog.submittedBy?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'You can only edit attendance logs you submitted' });
        }

        if (attendanceLog.status === 'SignedOff') {
            return res.status(400).json({ message: 'Signed-off entries cannot be edited' });
        }

        if (clientUpdatedAt && attendanceLog.updatedAt && new Date(attendanceLog.updatedAt) > new Date(clientUpdatedAt)) {
            return res.status(409).json(buildStaleUpdateConflict({
                entityType: 'AttendanceLog',
                currentRecord: attendanceLog.toObject(),
                clientPayload: requestBody,
                clientUpdatedAt,
                fields: ['entryType', 'periodStart', 'periodEnd', 'hoursWorked', 'tasksCompleted', 'notes'],
            }));
        }

        const { entryType, periodStart, periodEnd, hoursWorked, tasksCompleted, notes } = requestBody;
        const validationError = validateAttendancePayload({ entryType, periodStart, periodEnd, hoursWorked });
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        const before = attendanceLog.toObject();
        attendanceLog.entryType = entryType;
        attendanceLog.periodStart = periodStart;
        attendanceLog.periodEnd = periodEnd;
        attendanceLog.hoursWorked = hoursWorked;
        attendanceLog.tasksCompleted = tasksCompleted;
        attendanceLog.notes = notes || '';
        attendanceLog.status = 'Pending';
        attendanceLog.supervisorComment = '';
        attendanceLog.signedOffAt = undefined;
        attendanceLog.signedOffBy = undefined;
        if (req.user.role === 'IndustryPartner') {
            attendanceLog.submittedSource = 'Partner';
        }
        await attendanceLog.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'AttendanceLog',
            entityId: attendanceLog._id,
            summary: `Updated attendance log ${attendanceLog._id}`,
            before,
            after: attendanceLog,
        });

        const populated = await AttendanceLog.findById(attendanceLog._id)
            .populate('learner', 'name trackingId program')
            .populate('placement', 'companyName supervisorName supervisorEmail startDate endDate status')
            .populate('submittedBy', 'name role')
            .populate('signedOffBy', 'name role');

        res.json(populated);
    } catch (error) {
        console.error('Error updating attendance log:', error);
        res.status(500).json({ message: 'Error updating attendance log' });
    }
});

router.delete('/attendance-logs/:id', async (req, res) => {
    try {
        const scope = await buildAttendanceScope(req.user);
        const attendanceLog = await AttendanceLog.findOne({ _id: req.params.id, ...scope });
        if (!attendanceLog) {
            return res.status(404).json({ message: 'Attendance log not found or unauthorized' });
        }

        if (req.user.role === 'IndustryPartner' && attendanceLog.submittedBy?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'You can only delete attendance logs you submitted' });
        }

        if (attendanceLog.status === 'SignedOff') {
            return res.status(400).json({ message: 'Signed-off entries cannot be deleted' });
        }

        await AttendanceLog.deleteOne({ _id: attendanceLog._id });
        await logAuditEvent({
            req,
            action: 'DELETE',
            entityType: 'AttendanceLog',
            entityId: attendanceLog._id,
            summary: `Deleted attendance log ${attendanceLog._id}`,
            before: attendanceLog,
        });
        res.json({ message: 'Attendance log deleted' });
    } catch (error) {
        console.error('Error deleting attendance log:', error);
        res.status(500).json({ message: 'Error deleting attendance log' });
    }
});

router.put('/attendance-logs/:id/sign-off', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const attendanceLog = await AttendanceLog.findOne({
            _id: req.params.id,
            partner: getPartnerId(req.user),
        })
            .populate('learner', 'name')
            .populate('placement', 'partnerSupervisor');

        if (!attendanceLog) {
            return res.status(404).json({ message: 'Attendance log not found' });
        }

        if (!canActOnPartnerPlacement(req.user, attendanceLog.placement)) {
            return res.status(403).json({ message: 'This placement is assigned to another supervisor' });
        }

        const before = attendanceLog.toObject();
        attendanceLog.status = 'SignedOff';
        attendanceLog.supervisorComment = req.body.supervisorComment || '';
        attendanceLog.signedOffAt = new Date();
        attendanceLog.signedOffBy = req.user._id;
        await attendanceLog.save();

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'AttendanceLog',
            entityId: attendanceLog._id,
            summary: `Signed off attendance log ${attendanceLog._id}`,
            before,
            after: attendanceLog,
        });

        await notifyUsers({
            institution: attendanceLog.institution,
            sender: req.user._id,
            type: 'report',
            title: 'Hours signed off',
            message: `${attendanceLog.learner?.name || 'A learner'}'s attendance hours were signed off by the supervisor.`,
            link: '/attendance-logs',
        });

        const populated = await AttendanceLog.findById(attendanceLog._id)
            .populate('learner', 'name trackingId program')
            .populate('placement', 'companyName supervisorName supervisorEmail startDate endDate status')
            .populate('submittedBy', 'name role')
            .populate('signedOffBy', 'name role');

        res.json(populated);
    } catch (error) {
        console.error('Error signing off attendance log:', error);
        res.status(500).json({ message: 'Error signing off attendance log' });
    }
});

router.put('/attendance-logs/:id/reject', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const attendanceLog = await AttendanceLog.findOne({
            _id: req.params.id,
            partner: getPartnerId(req.user),
        })
            .populate('learner', 'name')
            .populate('placement', 'partnerSupervisor');

        if (!attendanceLog) {
            return res.status(404).json({ message: 'Attendance log not found' });
        }

        if (!canActOnPartnerPlacement(req.user, attendanceLog.placement)) {
            return res.status(403).json({ message: 'This placement is assigned to another supervisor' });
        }

        const before = attendanceLog.toObject();
        attendanceLog.status = 'Rejected';
        attendanceLog.supervisorComment = req.body.supervisorComment || '';
        attendanceLog.signedOffAt = new Date();
        attendanceLog.signedOffBy = req.user._id;
        await attendanceLog.save();

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'AttendanceLog',
            entityId: attendanceLog._id,
            summary: `Rejected attendance log ${attendanceLog._id}`,
            before,
            after: attendanceLog,
        });

        await notifyUsers({
            institution: attendanceLog.institution,
            sender: req.user._id,
            type: 'report',
            title: 'Hours returned for review',
            message: `${attendanceLog.learner?.name || 'A learner'}'s attendance entry was returned by the supervisor.`,
            link: '/attendance-logs',
        });

        const populated = await AttendanceLog.findById(attendanceLog._id)
            .populate('learner', 'name trackingId program')
            .populate('placement', 'companyName supervisorName supervisorEmail startDate endDate status')
            .populate('submittedBy', 'name role')
            .populate('signedOffBy', 'name role');

        res.json(populated);
    } catch (error) {
        console.error('Error rejecting attendance log:', error);
        res.status(500).json({ message: 'Error rejecting attendance log' });
    }
});

// ==================== USERS (Admin/SuperAdmin only) ====================

router.get('/users', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const users = await User.find(filter)
            .populate('partnerId', 'name')
            .populate('linkedLearners', 'name trackingId institution');
        const enrichedUsers = await attachUserAuditSummaries(users);
        res.json(enrichedUsers);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/users', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const privilegedConfirmation = requirePrivilegedRoleConfirmation(req.user, req.body);
        if (privilegedConfirmation) {
            return res.status(privilegedConfirmation.status).json(privilegedConfirmation);
        }

        const { password } = req.body;
        const validation = await normalizeUserPayloadForRole(req.user, req.body);
        if (validation.message) {
            return res.status(validation.status || 400).json({ message: validation.message });
        }

        req.body = validation.normalized;
        const { role } = req.body;

        let generatedPassword = null;

        if (!password) {
            // Generate an 8-character random password
            generatedPassword = crypto.randomBytes(4).toString('hex');
            req.body.password = generatedPassword;
        }

        const newUser = new User({
          ...req.body,
          invitationSentAt: new Date(),
        });
        await newUser.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'User',
            entityId: newUser._id,
            summary: `Created user ${newUser.name}`,
            after: newUser,
        });
        
        const populatedUser = await User.findById(newUser._id)
          .populate('partnerId', 'name')
          .populate('linkedLearners', 'name trackingId institution');

        const userJson = populatedUser.toJSON();
        if (generatedPassword) {
            userJson.defaultPassword = generatedPassword;
        }

        res.status(201).json(withUserLifecycleMeta(userJson));
    } catch (error) {
        console.error("Error creating user:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Email already exists' });
        }
        res.status(500).json({ message: 'Error creating user', error: error.message });
    }
});

router.put('/users/:id', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const userToUpdate = await User.findById(req.params.id);
        if (!userToUpdate) return res.status(404).json({ message: 'User not found' });

        // Scoping checks
        if (req.user.role === 'SuperAdmin') {
            // SuperAdmin can update any user
        } else if (req.user.role === 'RegionalAdmin') {
            // RegionalAdmin can only update users in institutions within their region
            const institutionMatches = userToUpdate.institution && (await Institution.exists({ name: userToUpdate.institution, region: req.user.region }));
            if (!(institutionMatches || userToUpdate.region === req.user.region)) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
        } else {
            if (userToUpdate.institution !== req.user.institution) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
        }

        // If password is provided, it will be hashed by the pre-save hook
        // We use save() instead of findByIdAndUpdate to trigger hooks
        const mergedPayload = {
            ...userToUpdate.toObject(),
            ...req.body,
        };
        const privilegedConfirmation = requirePrivilegedRoleConfirmation(req.user, mergedPayload, userToUpdate);
        if (privilegedConfirmation) {
            return res.status(privilegedConfirmation.status).json(privilegedConfirmation);
        }
        const validation = await normalizeUserPayloadForRole(req.user, mergedPayload, userToUpdate);
        if (validation.message) {
            return res.status(validation.status || 400).json({ message: validation.message });
        }

        const before = userToUpdate.toObject();
        const updatePayload = { ...validation.normalized };
        if (!updatePayload.password) {
            delete updatePayload.password;
        }

        const statusBeingDeactivated = before.status === 'Active' && updatePayload.status === 'Inactive';
        if (statusBeingDeactivated) {
            const impact = await getUserDeactivationImpact(userToUpdate._id);
            if (hasDeactivationBlockers(impact)) {
                return res.status(409).json({
                    message: 'This user still owns active work and cannot be deactivated until assignments are reassigned.',
                    blockers: impact,
                });
            }
        }

        Object.assign(userToUpdate, updatePayload);
        await userToUpdate.save();
        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'User',
            entityId: userToUpdate._id,
            summary: `Updated user ${userToUpdate.name}`,
            before,
            after: userToUpdate,
        });
        const populatedUser = await User.findById(userToUpdate._id)
            .populate('partnerId')
            .populate('linkedLearners', 'name trackingId institution');
        res.json(withUserLifecycleMeta(populatedUser));
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: 'Error updating user' });
    }
});

router.post('/users/:id/send-setup-link', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id).populate('partnerId', 'name');
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const manageableRoles = getManageableUserRoles(req.user.role);
        if (!manageableRoles.includes(targetUser.role)) {
            return res.status(403).json({ message: 'Forbidden: You cannot manage this user account' });
        }

        if (req.user.role === 'RegionalAdmin') {
            const institutionMatches = targetUser.institution && (await Institution.exists({ name: targetUser.institution, region: req.user.region }));
            if (!(institutionMatches || targetUser.region === req.user.region)) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
        } else if (req.user.role === 'Admin' && targetUser.institution !== req.user.institution) {
            return res.status(403).json({ message: 'Forbidden: Access denied' });
        }

        const rawToken = crypto.randomBytes(20).toString('hex');
        targetUser.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
        targetUser.resetPasswordExpires = Date.now() + 3600000;
        targetUser.passwordChangeRequired = true;
        targetUser.invitationSentAt = new Date();
        await targetUser.save();

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${frontendUrl}/reset-password/${rawToken}`;
        await sendPasswordResetEmail(targetUser.email, resetUrl);

        await logAuditEvent({
            req,
            action: 'AUTH',
            entityType: 'User',
            entityId: targetUser._id,
            summary: `Sent access setup/reset link to ${targetUser.email}`,
            metadata: { lifecycleAction: 'SEND_SETUP_LINK' },
            changedFields: ['resetPasswordToken', 'resetPasswordExpires', 'passwordChangeRequired', 'invitationSentAt'],
        });

        res.json(withUserLifecycleMeta(targetUser));
    } catch (error) {
        console.error('Error sending setup/reset link:', error);
        res.status(500).json({ message: 'Error sending setup/reset link' });
    }
});

router.get('/users/:id/deactivation-impact', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id).select('_id role institution region');
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const manageableRoles = getManageableUserRoles(req.user.role);
        if (!manageableRoles.includes(targetUser.role)) {
            return res.status(403).json({ message: 'Forbidden: You cannot manage this user account' });
        }

        if (req.user.role === 'RegionalAdmin') {
            const institutionMatches = targetUser.institution && (await Institution.exists({ name: targetUser.institution, region: req.user.region }));
            if (!(institutionMatches || targetUser.region === req.user.region)) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
        } else if (req.user.role === 'Admin' && targetUser.institution !== req.user.institution) {
            return res.status(403).json({ message: 'Forbidden: Access denied' });
        }

        const impact = await getUserDeactivationImpact(targetUser._id);
        res.json({
            message: hasDeactivationBlockers(impact)
                ? 'This user still owns active work that should be reassigned before deactivation.'
                : 'This user has no active blockers and can be deactivated.',
            blockers: impact,
        });
    } catch (error) {
        console.error('Error fetching deactivation impact:', error);
        res.status(500).json({ message: 'Error fetching deactivation impact' });
    }
});

router.get('/users/:id/reassignment-options', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id).select('_id role institution region partnerId');
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const manageableRoles = getManageableUserRoles(req.user.role);
        if (!manageableRoles.includes(targetUser.role)) {
            return res.status(403).json({ message: 'Forbidden: You cannot manage this user account' });
        }

        if (req.user.role === 'RegionalAdmin') {
            const institutionMatches = targetUser.institution && (await Institution.exists({ name: targetUser.institution, region: req.user.region }));
            if (!(institutionMatches || targetUser.region === req.user.region)) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
        } else if (req.user.role === 'Admin' && targetUser.institution !== req.user.institution) {
            return res.status(403).json({ message: 'Forbidden: Access denied' });
        }

        const [ownerCandidates, supportAssignees, partnerSupervisors] = await Promise.all([
            getOperationalOwnerCandidates(req.user),
            canManageSupportAssignments(req.user) ? getVisibleSupportAssignees(req.user) : Promise.resolve([]),
            req.user.role === 'SuperAdmin' && targetUser.role === 'IndustryPartner' && targetUser.partnerId
              ? User.find({
                    partnerId: targetUser.partnerId,
                    role: 'IndustryPartner',
                    status: 'Active',
                    _id: { $ne: targetUser._id },
                }).select('_id name email')
              : Promise.resolve([]),
        ]);

        res.json({
            ownerCandidates,
            supportAssignees,
            partnerSupervisors,
        });
    } catch (error) {
        console.error('Error fetching reassignment options:', error);
        res.status(500).json({ message: 'Error fetching reassignment options' });
    }
});

router.delete('/users/:id', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);
        if (!userToDelete) return res.status(404).json({ message: 'User not found' });

        if (req.user.role === 'SuperAdmin') {
            // SuperAdmin can delete any user
        } else if (req.user.role === 'RegionalAdmin') {
            // RegionalAdmin can only delete users in institutions within their region
            const insts = await Institution.find({ region: req.user.region }).select('name');
            const instNames = insts.map(i => i.name);
            if (!instNames.includes(userToDelete.institution)) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
        } else {
            // Regular Admin/Manager can only delete users from their own institution
            if (userToDelete.institution !== req.user.institution) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
        }

        await User.findByIdAndDelete(req.params.id);
        await logAuditEvent({
            req,
            action: 'DELETE',
            entityType: 'User',
            entityId: userToDelete._id,
            summary: `Deleted user ${userToDelete.name}`,
            before: userToDelete,
        });
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user' });
    }
});

// ==================== MY INSTITUTION ====================

router.get('/my-institution', async (req, res) => {
    try {
        const inst = await Institution.findOne({ name: req.user.institution });
        if (!inst) return res.status(404).json({ message: 'Institution not found' });
        res.json(inst);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==================== INSTITUTIONS (SuperAdmin only) ====================

router.get('/institutions', requireRole('SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const filter = {};
        // RegionalAdmin can only see their own region's institutions
        if (req.user.role === 'RegionalAdmin') {
            filter.region = req.user.region;
        } else if (req.query.region) {
            // SuperAdmin can filter by region via query param
            filter.region = req.query.region;
        }
        const institutions = await Institution.find(filter).sort({ name: 1 });
        res.json(institutions);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/institutions', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const newInstitution = new Institution(req.body);
        await newInstitution.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'Institution',
            entityId: newInstitution._id,
            summary: `Created institution ${newInstitution.name}`,
            after: newInstitution,
        });
        res.status(201).json(newInstitution);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Institution or Code already exists' });
        }
        res.status(500).json({ message: 'Error creating institution' });
    }
});

router.put('/institutions/:id', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const existingInstitution = await Institution.findById(req.params.id);
        const updatedInstitution = await Institution.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (updatedInstitution && existingInstitution) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'Institution',
                entityId: updatedInstitution._id,
                summary: `Updated institution ${updatedInstitution.name}`,
                before: existingInstitution,
                after: updatedInstitution,
            });
        }
        res.json(updatedInstitution);
    } catch (error) {
        res.status(500).json({ message: 'Error updating institution' });
    }
});

router.delete('/institutions/:id', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const deletedInstitution = await Institution.findByIdAndDelete(req.params.id);
        if (deletedInstitution) {
            await logAuditEvent({
                req,
                action: 'DELETE',
                entityType: 'Institution',
                entityId: deletedInstitution._id,
                summary: `Deleted institution ${deletedInstitution.name}`,
                before: deletedInstitution,
            });
        }
        res.json({ message: 'Institution deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting institution' });
    }
});

// ==================== SUPER ADMIN OVERVIEW ====================

router.get('/admin/overview', requireRole('SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const instFilter = Object.keys(filter).length > 0 ? { name: filter.institution } : {};
        const supportScope = await getSupportTicketScope(req.user);
        const auditScope = await getAuditLogScope(req.user);
        const attendanceScope = await buildAttendanceScope(req.user);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const now = new Date();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Aggregate stats per institution
        const institutionStats = await Learner.aggregate([
            { $match: filter },
            { $group: { 
                _id: '$institution', 
                totalLearners: { $sum: 1 },
                currentEnrolled: {
                    $sum: {
                        $cond: [
                            { $in: ['$academicStatus', ['Active', 'Graduating']] },
                            1,
                            0,
                        ],
                    },
                },
                academicActive: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Active'] }, 1, 0] } },
                academicGraduating: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduating'] }, 1, 0] } },
                academicGraduated: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduated'] }, 1, 0] } },
                placed: { $sum: { $cond: [{ $eq: ['$status', 'Placed'] }, 1, 0] } },
                pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
                dropped: { $sum: { $cond: [{ $eq: ['$status', 'Dropped'] }, 1, 0] } },
            }},
            { $sort: { totalLearners: -1 } }
        ]);

        // Aggregate stats by region
        const regionalStatsBase = await Learner.aggregate([
            { $match: filter },
            { $group: { 
                _id: '$region', 
                totalLearners: { $sum: 1 },
                currentEnrolled: {
                    $sum: {
                        $cond: [
                            { $in: ['$academicStatus', ['Active', 'Graduating']] },
                            1,
                            0,
                        ],
                    },
                },
                academicGraduating: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduating'] }, 1, 0] } },
                academicGraduated: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduated'] }, 1, 0] } },
                placed: { $sum: { $cond: [{ $eq: ['$status', 'Placed'] }, 1, 0] } },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
                institutions: { $addToSet: '$institution' }
            }},
            { $project: {
                region: '$_id',
                totalLearners: 1,
                currentEnrolled: 1,
                academicGraduating: 1,
                academicGraduated: 1,
                placed: 1,
                completed: 1,
                institutionCount: { $size: '$institutions' },
                placementRate: { 
                    $cond: [
                        { $gt: ['$totalLearners', 0] },
                        { $multiply: [{ $divide: ['$placed', '$totalLearners'] }, 100] },
                        0
                    ]
                },
                completionRate: {
                    $cond: [
                        { $gt: ['$totalLearners', 0] },
                        { $multiply: [{ $divide: ['$completed', '$totalLearners'] }, 100] },
                        0
                    ]
                }
            }},
            { $sort: { totalLearners: -1 } }
        ]);

        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const sparklineMonthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const monthlyRegionalPlacements = await Placement.aggregate([
            { $match: { ...filter, createdAt: { $gte: previousMonthStart } } },
            {
                $lookup: {
                    from: 'learners',
                    localField: 'learner',
                    foreignField: '_id',
                    as: 'learnerDoc'
                }
            },
            { $unwind: '$learnerDoc' },
            {
                $project: {
                    region: '$learnerDoc.region',
                    monthBucket: {
                        $cond: [
                            { $gte: ['$createdAt', currentMonthStart] },
                            'current',
                            'previous'
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: { region: '$region', monthBucket: '$monthBucket' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const regionalPlacementMovement = monthlyRegionalPlacements.reduce((acc, item) => {
            const region = item._id.region || 'Unknown';
            if (!acc[region]) {
                acc[region] = { currentMonthPlacements: 0, previousMonthPlacements: 0 };
            }
            if (item._id.monthBucket === 'current') {
                acc[region].currentMonthPlacements = item.count;
            } else {
                acc[region].previousMonthPlacements = item.count;
            }
            return acc;
        }, {});

        const regionalPlacementTrendRaw = await Placement.aggregate([
            { $match: { ...filter, createdAt: { $gte: sparklineMonthStart } } },
            {
                $lookup: {
                    from: 'learners',
                    localField: 'learner',
                    foreignField: '_id',
                    as: 'learnerDoc'
                }
            },
            { $unwind: '$learnerDoc' },
            {
                $group: {
                    _id: {
                        region: '$learnerDoc.region',
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        const regionalPlacementTrend = regionalPlacementTrendRaw.reduce((acc, item) => {
            const region = item._id.region || 'Unknown';
            if (!acc[region]) {
                acc[region] = {};
            }
            acc[region][`${item._id.year}-${item._id.month}`] = item.count;
            return acc;
        }, {});

        const regionalStats = regionalStatsBase
            .map((regionStat) => {
                const movement = regionalPlacementMovement[regionStat.region || 'Unknown'] || {
                    currentMonthPlacements: 0,
                    previousMonthPlacements: 0,
                };
                const monthOverMonthDelta = movement.currentMonthPlacements - movement.previousMonthPlacements;
                const monthOverMonthPercent = movement.previousMonthPlacements > 0
                    ? Math.round((monthOverMonthDelta / movement.previousMonthPlacements) * 100)
                    : (movement.currentMonthPlacements > 0 ? 100 : 0);
                const needsIntervention = regionStat.placementRate < 45 || regionStat.completionRate < 20 || monthOverMonthDelta < 0;
                const interventionReasons = [];
                if (regionStat.placementRate < 45) interventionReasons.push('Low placement rate');
                if (regionStat.completionRate < 20) interventionReasons.push('Low completion rate');
                if (monthOverMonthDelta < 0) interventionReasons.push('Placements falling month-over-month');

                return {
                    ...regionStat,
                    currentMonthPlacements: movement.currentMonthPlacements,
                    previousMonthPlacements: movement.previousMonthPlacements,
                    monthOverMonthDelta,
                    monthOverMonthPercent,
                    movementDirection: monthOverMonthDelta > 0 ? 'up' : monthOverMonthDelta < 0 ? 'down' : 'flat',
                    needsIntervention,
                    interventionReasons,
                    sparkline: Array.from({ length: 6 }, (_, offset) => {
                        const d = new Date(now.getFullYear(), now.getMonth() - (5 - offset), 1);
                        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
                        return {
                            month: monthNames[d.getMonth()],
                            count: regionalPlacementTrend[regionStat.region || 'Unknown']?.[key] || 0,
                        };
                    }),
                };
            })
            .sort((a, b) => {
                if (b.placementRate !== a.placementRate) return b.placementRate - a.placementRate;
                return b.completionRate - a.completionRate;
            });

        // Users: RegionalAdmin users don't have 'institution', they have 'region'
        let totalUsers;
        if (req.user.role === 'RegionalAdmin') {
            totalUsers = await User.countDocuments({ $or: [{ institution: filter.institution }, { region: req.user.region }] });
        } else {
            totalUsers = await User.countDocuments();
        }
        const totalLearners = await Learner.countDocuments(filter);
        const [academicActiveLearners, academicGraduatingLearners, academicGraduatedLearners, academicDroppedLearners] = await Promise.all([
            Learner.countDocuments({ ...filter, academicStatus: 'Active' }),
            Learner.countDocuments({ ...filter, academicStatus: 'Graduating' }),
            Learner.countDocuments({ ...filter, academicStatus: 'Graduated' }),
            Learner.countDocuments({ ...filter, academicStatus: 'Dropped' }),
        ]);
        const cohortBreakdown = await Learner.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: { $ifNull: ['$intakeAcademicYear', 'Unspecified'] },
                    totalLearners: { $sum: 1 },
                    currentEnrolled: {
                        $sum: {
                            $cond: [
                                { $in: ['$academicStatus', ['Active', 'Graduating']] },
                                1,
                                0,
                            ],
                        },
                    },
                    graduating: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduating'] }, 1, 0] } },
                    graduated: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduated'] }, 1, 0] } },
                    dropped: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Dropped'] }, 1, 0] } },
                    placed: { $sum: { $cond: [{ $eq: ['$status', 'Placed'] }, 1, 0] } },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
                    regions: { $addToSet: '$region' },
                    institutions: { $addToSet: '$institution' },
                },
            },
            { $sort: { _id: -1 } },
        ]);
        const regionalCohortBreakdown = await Learner.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: {
                        region: { $ifNull: ['$region', 'Unknown'] },
                        intakeAcademicYear: { $ifNull: ['$intakeAcademicYear', 'Unspecified'] },
                    },
                    totalLearners: { $sum: 1 },
                    currentEnrolled: {
                        $sum: {
                            $cond: [
                                { $in: ['$academicStatus', ['Active', 'Graduating']] },
                                1,
                                0,
                            ],
                        },
                    },
                    graduating: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduating'] }, 1, 0] } },
                    graduated: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduated'] }, 1, 0] } },
                    institutions: { $addToSet: '$institution' },
                },
            },
            { $sort: { '_id.intakeAcademicYear': -1, '_id.region': 1 } },
        ]);
        const institutionCohortBreakdown = await Learner.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: {
                        institution: { $ifNull: ['$institution', 'Unknown'] },
                        intakeAcademicYear: { $ifNull: ['$intakeAcademicYear', 'Unspecified'] },
                    },
                    region: { $first: '$region' },
                    totalLearners: { $sum: 1 },
                    currentEnrolled: {
                        $sum: {
                            $cond: [
                                { $in: ['$academicStatus', ['Active', 'Graduating']] },
                                1,
                                0,
                            ],
                        },
                    },
                    graduating: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduating'] }, 1, 0] } },
                    graduated: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Graduated'] }, 1, 0] } },
                },
            },
            { $sort: { '_id.intakeAcademicYear': -1, '_id.institution': 1 } },
        ]);
        const totalPlacements = await Placement.countDocuments(filter);
        const totalVisits = await MonitoringVisit.countDocuments(filter);
        // Semester Report filter scoped by institution names
        const reportFilter = Object.keys(filter).length > 0 ? { institution: filter.institution } : {};
        const totalReports = await SemesterReport.countDocuments(reportFilter);
        const institutions = await Institution.find(instFilter).sort({ name: 1 });
        const partnerFilter = req.user.role === 'RegionalAdmin' ? { region: req.user.region } : {};
        const totalPartners = await IndustryPartner.countDocuments(partnerFilter);
        const partnersDetails = await IndustryPartner.find(partnerFilter).sort({ createdAt: -1 });

        // Overall placement rate
        const placedLearners = await Learner.countDocuments({ ...filter, status: 'Placed' });
        const overallPlacementRate = totalLearners > 0
            ? Math.round((placedLearners / totalLearners) * 100)
            : 0;

        // Placement trend — last 12 months
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);
        twelveMonthsAgo.setHours(0, 0, 0, 0);

        const placementTrend = await Placement.aggregate([
            { $match: { ...filter, createdAt: { $gte: twelveMonthsAgo } } },
            { $group: {
                _id: { 
                    year: { $year: '$createdAt' }, 
                    month: { $month: '$createdAt' } 
                },
                count: { $sum: 1 }
            }},
            { $sort: { '_id.year': 1, '_id.month': 1 } },
            { $project: {
                _id: 0,
                year: '$_id.year',
                month: '$_id.month',
                count: 1
            }}
        ]);

        // Fill in missing months with 0
        const filledTrend = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const found = placementTrend.find(p => p.year === year && p.month === month);
            filledTrend.push({
                name: monthNames[month - 1],
                year,
                month,
                count: found ? found.count : 0
            });
        }
        // Gender distribution
        const genderDistribution = await Learner.aggregate([
            { $match: filter },
            { $group: { _id: '$gender', count: { $sum: 1 } } },
            { $project: { _id: 0, gender: { $ifNull: ['$_id', 'Unknown'] }, count: 1 } },
            { $sort: { count: -1 } }
        ]);

        // Trade/Program distribution
        const programDistribution = await Learner.aggregate([
            { $match: filter },
            { $group: { _id: '$program', count: { $sum: 1 } } },
            { $project: { _id: 0, program: { $ifNull: ['$_id', 'Unknown'] }, count: 1 } },
            { $sort: { count: -1 } }
        ]);

        // Average time to placement (in days)
        const avgTimePipeline = await Placement.aggregate([
            { $match: filter },
            { $lookup: {
                from: 'learners',
                localField: 'learner',
                foreignField: '_id',
                as: 'learnerDoc'
            }},
            { $unwind: '$learnerDoc' },
            { $project: {
                daysToPlace: {
                    $divide: [
                        { $subtract: ['$createdAt', '$learnerDoc.createdAt'] },
                        1000 * 60 * 60 * 24 // ms to days
                    ]
                }
            }},
            { $group: { _id: null, avgDays: { $avg: '$daysToPlace' } } }
        ]);
        const avgTimeToPlacement = avgTimePipeline.length > 0
            ? Math.round(avgTimePipeline[0].avgDays)
            : 0;

        // Report approval pipeline — count per status
        const reportPipeline = await SemesterReport.aggregate([
            { $match: reportFilter },
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $project: { _id: 0, status: '$_id', count: 1 } }
        ]);

        // Pending reports needing action from this user's role
        const pendingReports = req.user.role === 'RegionalAdmin'
            ? await SemesterReport.countDocuments({ ...reportFilter, status: 'Submitted' })
            : await SemesterReport.countDocuments({ ...reportFilter, status: 'Regional_Approved' });

        const approvalQueueFilter = req.user.role === 'RegionalAdmin'
            ? { ...reportFilter, status: 'Submitted' }
            : { ...reportFilter, status: 'Regional_Approved' };
        const approvalQueue = await SemesterReport.find(approvalQueueFilter)
            .sort({ createdAt: 1 })
            .limit(6)
            .select('institution semester academicYear status createdAt');
        const overdueApprovals = await SemesterReport.countDocuments({
            ...approvalQueueFilter,
            createdAt: { $lte: sevenDaysAgo },
        });
        const recentRejectedReports = await SemesterReport.find({ ...reportFilter, status: 'Rejected' })
            .sort({ updatedAt: -1 })
            .limit(5)
            .select('institution semester academicYear updatedAt');

        const unresolvedSupportFilter = {
            ...supportScope,
            status: { $in: ['Open', 'InProgress'] },
        };
        const [supportStats, supportCategoryBreakdown, supportRegionBreakdown, supportQueue] = await Promise.all([
            SupportTicket.aggregate([
                { $match: supportScope },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        open: { $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] } },
                        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'InProgress'] }, 1, 0] } },
                        urgentOpen: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ['$priority', 'Urgent'] },
                                            { $in: ['$status', ['Open', 'InProgress']] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },
                    },
                },
            ]),
            SupportTicket.aggregate([
                { $match: unresolvedSupportFilter },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $project: { _id: 0, category: '$_id', count: 1 } },
                { $sort: { count: -1 } },
            ]),
            SupportTicket.aggregate([
                { $match: unresolvedSupportFilter },
                { $group: { _id: { $ifNull: ['$region', 'Unassigned'] }, count: { $sum: 1 } } },
                { $project: { _id: 0, region: '$_id', count: 1 } },
                { $sort: { count: -1 } },
            ]),
            SupportTicket.find(unresolvedSupportFilter)
                .populate('requester', 'name')
                .sort({ updatedAt: 1, createdAt: 1 })
                .limit(6)
                .select('subject priority status institution region createdAt updatedAt replies requester'),
        ]);
        const oldestOpenTicket = await SupportTicket.findOne(unresolvedSupportFilter)
            .sort({ createdAt: 1 })
            .select('createdAt');
        const oldestOpenTicketAgeDays = oldestOpenTicket
            ? Math.max(0, Math.floor((Date.now() - oldestOpenTicket.createdAt.getTime()) / (1000 * 60 * 60 * 24)))
            : 0;

        const recentSensitiveEventsFilter = {
            ...auditScope,
            $or: [
                { action: 'DELETE' },
                { action: 'AUTH' },
                { action: 'STATUS_CHANGE' },
                { entityType: 'User' },
            ],
        };
        const [auditEventCount, deleteEventCount, authEventCount, statusChangeEventCount, topActors, recentSensitiveEvents] = await Promise.all([
            AuditLog.countDocuments({ ...auditScope, createdAt: { $gte: sevenDaysAgo } }),
            AuditLog.countDocuments({ ...auditScope, action: 'DELETE', createdAt: { $gte: sevenDaysAgo } }),
            AuditLog.countDocuments({ ...auditScope, action: 'AUTH', createdAt: { $gte: sevenDaysAgo } }),
            AuditLog.countDocuments({ ...auditScope, action: 'STATUS_CHANGE', createdAt: { $gte: sevenDaysAgo } }),
            AuditLog.aggregate([
                { $match: { ...auditScope, createdAt: { $gte: sevenDaysAgo } } },
                {
                    $group: {
                        _id: { actorId: '$actorId', actorName: '$actorName', actorRole: '$actorRole' },
                        count: { $sum: 1 },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        actorId: '$_id.actorId',
                        actorName: '$_id.actorName',
                        actorRole: '$_id.actorRole',
                        count: 1,
                    },
                },
                { $sort: { count: -1 } },
                { $limit: 5 },
            ]),
            AuditLog.find(recentSensitiveEventsFilter)
                .sort({ createdAt: -1 })
                .limit(6)
                .select('action entityType summary actorName actorRole institution createdAt'),
        ]);

        const [stalePendingLearners, placementsMissingSupervisor, pendingAttendanceSignOff, activePlacementsWithoutVisits] = await Promise.all([
            Learner.countDocuments({
                ...filter,
                status: 'Pending',
                createdAt: { $lte: fourteenDaysAgo },
            }),
            Placement.countDocuments({
                ...filter,
                status: 'Active',
                $or: [
                    { supervisorName: { $exists: false } },
                    { supervisorName: '' },
                    { supervisorEmail: { $exists: false } },
                    { supervisorEmail: '' },
                ],
            }),
            AttendanceLog.countDocuments({
                ...attendanceScope,
                status: 'Pending',
                createdAt: { $lte: threeDaysAgo },
            }),
            Placement.aggregate([
                {
                    $match: {
                        ...filter,
                        status: 'Active',
                        startDate: { $lte: fourteenDaysAgo },
                    },
                },
                {
                    $lookup: {
                        from: 'monitoringvisits',
                        localField: 'learner',
                        foreignField: 'learner',
                        as: 'visits',
                    },
                },
                { $match: { visits: { $eq: [] } } },
                { $count: 'count' },
            ]),
        ]);

        const calendarScope = req.user.role === 'RegionalAdmin'
            ? { region: req.user.region }
            : {};
        const activeCalendarEvents = await AcademicCalendar.find({ isActive: true }).sort({ startDate: 1 });
        const upcomingDeadlines = activeCalendarEvents
            .filter((event) => event.eventType === 'Deadline' && event.endDate >= now)
            .slice(0, 5)
            .map((event) => ({
                _id: event._id,
                title: event.title,
                startDate: event.startDate,
                endDate: event.endDate,
                semester: event.semester || '',
                academicYear: event.academicYear || '',
                description: event.description || '',
                daysRemaining: Math.max(0, Math.ceil((event.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
            }));

        const cycleDeadlines = activeCalendarEvents
            .filter((event) => event.eventType === 'Deadline' && event.semester && event.academicYear)
            .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
        const currentCycleDeadline = cycleDeadlines.find((event) => event.endDate >= now)
            || [...cycleDeadlines].reverse().find((event) => event.endDate < now)
            || null;

        let deadlineRisk = {
            currentCycle: null,
            overdueInstitutionSubmissions: [],
            atRiskInstitutions: [],
        };

        if (currentCycleDeadline) {
            const cycleReports = await SemesterReport.find({
                institution: { $in: institutions.map((institution) => institution.name) },
                semester: currentCycleDeadline.semester,
                academicYear: currentCycleDeadline.academicYear,
            }).select('institution status updatedAt');

            const reportByInstitution = cycleReports.reduce((acc, report) => {
                acc[report.institution] = report;
                return acc;
            }, {});

            const isSubmittedForCycle = (report) => report && !['Generated', 'Rejected'].includes(report.status);
            const daysUntilDeadline = Math.ceil((currentCycleDeadline.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            const overdueInstitutionSubmissions = institutions
                .filter((institution) => {
                    const report = reportByInstitution[institution.name];
                    return currentCycleDeadline.endDate < now && !isSubmittedForCycle(report);
                })
                .map((institution) => {
                    const report = reportByInstitution[institution.name];
                    return {
                        _id: institution._id,
                        institution: institution.name,
                        region: institution.region,
                        status: report?.status || 'Missing',
                        code: institution.code,
                    };
                })
                .slice(0, 8);

            const atRiskInstitutions = institutions
                .filter((institution) => {
                    const report = reportByInstitution[institution.name];
                    return currentCycleDeadline.endDate >= now && daysUntilDeadline <= 14 && !isSubmittedForCycle(report);
                })
                .map((institution) => {
                    const report = reportByInstitution[institution.name];
                    return {
                        _id: institution._id,
                        institution: institution.name,
                        region: institution.region,
                        status: report?.status || 'Not started',
                        code: institution.code,
                        daysRemaining: Math.max(0, daysUntilDeadline),
                    };
                })
                .slice(0, 8);

            deadlineRisk = {
                currentCycle: {
                    title: currentCycleDeadline.title,
                    semester: currentCycleDeadline.semester,
                    academicYear: currentCycleDeadline.academicYear,
                    endDate: currentCycleDeadline.endDate,
                    daysRemaining: Math.max(daysUntilDeadline, 0),
                    isOverdue: currentCycleDeadline.endDate < now,
                },
                overdueInstitutionSubmissions,
                atRiskInstitutions,
            };
        }

        const userScope = req.user.role === 'RegionalAdmin'
            ? {
                $or: [
                    { institution: filter.institution },
                    { region: req.user.region },
                ],
            }
            : {};
        const governedUsers = await User.find(userScope).select('role status institution region passwordChangeRequired');
        const roleBreakdownMap = governedUsers.reduce((acc, user) => {
            acc[user.role] = (acc[user.role] || 0) + 1;
            return acc;
        }, {});
        const inactiveUsers = governedUsers.filter((user) => user.status === 'Inactive').length;
        const pendingPasswordResets = governedUsers.filter((user) => user.passwordChangeRequired).length;

        const activeAdminsByInstitution = governedUsers.reduce((acc, user) => {
            if (user.role === 'Admin' && user.status === 'Active' && user.institution) {
                acc[user.institution] = (acc[user.institution] || 0) + 1;
            }
            return acc;
        }, {});

        const institutionsWithoutActiveAdmins = institutions
            .filter((institution) => !activeAdminsByInstitution[institution.name])
            .map((institution) => ({
                _id: institution._id,
                name: institution.name,
                region: institution.region,
                code: institution.code,
            }))
            .slice(0, 8);

        const privilegedUserAnomalies = Object.values(governedUsers.reduce((acc, user) => {
            if (!user.institution || !['Admin', 'Manager'].includes(user.role)) {
                return acc;
            }

            if (!acc[user.institution]) {
                acc[user.institution] = {
                    institution: user.institution,
                    adminCount: 0,
                    managerCount: 0,
                    privilegedCount: 0,
                    activePrivilegedCount: 0,
                };
            }

            if (user.role === 'Admin') acc[user.institution].adminCount += 1;
            if (user.role === 'Manager') acc[user.institution].managerCount += 1;
            acc[user.institution].privilegedCount += 1;
            if (user.status === 'Active') {
                acc[user.institution].activePrivilegedCount += 1;
            }
            return acc;
        }, {}))
            .filter((entry) => entry.activePrivilegedCount > 3 || entry.adminCount > 1)
            .sort((a, b) => b.activePrivilegedCount - a.activePrivilegedCount)
            .slice(0, 8)
            .map((entry) => ({
                ...entry,
                reasons: [
                    ...(entry.adminCount > 1 ? ['Multiple admins assigned'] : []),
                    ...(entry.activePrivilegedCount > 3 ? ['High privileged-user count'] : []),
                ],
            }));

        res.json({
            totalUsers,
            totalLearners,
            totalPlacements,
            totalVisits,
            totalReports,
            totalPartners,
            partnersDetails,
            academicSummary: {
                currentEnrolled: academicActiveLearners + academicGraduatingLearners,
                active: academicActiveLearners,
                graduating: academicGraduatingLearners,
                graduated: academicGraduatedLearners,
                dropped: academicDroppedLearners,
            },
            intakeCohorts: cohortBreakdown.map((cohort) => withCohortRiskMeta({
                intakeAcademicYear: cohort._id,
                totalLearners: cohort.totalLearners,
                currentEnrolled: cohort.currentEnrolled,
                graduating: cohort.graduating,
                graduated: cohort.graduated,
                dropped: cohort.dropped,
                placed: cohort.placed,
                completed: cohort.completed,
                regionCount: cohort.regions.filter(Boolean).length,
                institutionCount: cohort.institutions.filter(Boolean).length,
            })),
            regionalCohortBreakdown: regionalCohortBreakdown.map((cohort) => ({
                region: cohort._id.region,
                intakeAcademicYear: cohort._id.intakeAcademicYear,
                totalLearners: cohort.totalLearners,
                currentEnrolled: cohort.currentEnrolled,
                graduating: cohort.graduating,
                graduated: cohort.graduated,
                institutionCount: cohort.institutions.filter(Boolean).length,
            })),
            institutionCohortBreakdown: institutionCohortBreakdown.map((cohort) => ({
                institution: cohort._id.institution,
                region: cohort.region || 'Unknown',
                intakeAcademicYear: cohort._id.intakeAcademicYear,
                totalLearners: cohort.totalLearners,
                currentEnrolled: cohort.currentEnrolled,
                graduating: cohort.graduating,
                graduated: cohort.graduated,
            })),
            totalInstitutions: institutions.length,
            institutions: institutions.map(i => i.name),
            institutionDetails: institutions,
            institutionStats,
            regionalStats,
            overallPlacementRate,
            placementTrend: filledTrend,
            genderDistribution,
            programDistribution,
            avgTimeToPlacement,
            pendingReports,
            reportPipeline,
            approvalInbox: {
                pendingCount: pendingReports,
                overdueCount: overdueApprovals,
                recentRejectedCount: recentRejectedReports.length,
                queue: approvalQueue.map((report) => ({
                    _id: report._id,
                    institution: report.institution,
                    title: `${report.semester} ${report.academicYear}`,
                    status: report.status,
                    createdAt: report.createdAt,
                    ageDays: Math.max(0, Math.floor((Date.now() - report.createdAt.getTime()) / (1000 * 60 * 60 * 24))),
                })),
                recentRejected: recentRejectedReports.map((report) => ({
                    _id: report._id,
                    institution: report.institution,
                    title: `${report.semester} ${report.academicYear}`,
                    updatedAt: report.updatedAt,
                })),
            },
            supportSummary: {
                total: supportStats[0]?.total || 0,
                open: supportStats[0]?.open || 0,
                inProgress: supportStats[0]?.inProgress || 0,
                urgentOpen: supportStats[0]?.urgentOpen || 0,
                oldestOpenAgeDays: oldestOpenTicketAgeDays,
                categoryBreakdown: supportCategoryBreakdown,
                regionBreakdown: supportRegionBreakdown,
                queue: supportQueue.map((ticket) => ({
                    _id: ticket._id,
                    subject: ticket.subject,
                    priority: ticket.priority,
                    status: ticket.status,
                    institution: ticket.institution,
                    region: ticket.region,
                    requesterName: ticket.requester?.name || 'Unknown',
                    createdAt: ticket.createdAt,
                    updatedAt: ticket.updatedAt,
                    replyCount: ticket.replies?.length || 0,
                })),
            },
            auditSummary: {
                eventsLast7Days: auditEventCount,
                destructiveEventsLast7Days: deleteEventCount,
                authEventsLast7Days: authEventCount,
                statusChangesLast7Days: statusChangeEventCount,
                topActors,
                recentSensitiveEvents: recentSensitiveEvents.map((event) => ({
                    _id: event._id,
                    action: event.action,
                    entityType: event.entityType,
                    summary: event.summary,
                    actorName: event.actorName,
                    actorRole: event.actorRole,
                    institution: event.institution,
                    createdAt: event.createdAt,
                })),
            },
            dataQualityAlerts: {
                stalePendingLearners,
                placementsMissingSupervisor,
                pendingAttendanceSignOff,
                activePlacementsWithoutVisits: activePlacementsWithoutVisits[0]?.count || 0,
            },
            userGovernance: {
                inactiveUsers,
                pendingPasswordResets,
                institutionsWithoutActiveAdmins,
                privilegedUserAnomalies,
                roleBreakdown: Object.entries(roleBreakdownMap)
                    .map(([role, count]) => ({ role, count }))
                    .sort((a, b) => b.count - a.count),
            },
            deadlineRisk: {
                upcomingDeadlines,
                ...deadlineRisk,
            },
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});

// ==================== INDUSTRY PARTNERS ====================

router.get('/industry-partners', async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'RegionalAdmin') {
            filter.region = req.user.region;
        } else if (req.user.role === 'Admin' || req.user.role === 'Manager') {
            filter.linkedInstitutions = req.user.institution;
        }
        const partners = await IndustryPartner.find(filter).sort({ name: 1 });
        res.json(partners);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.get('/industry-partners/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.json([]);
        
        const filter = { name: { $regex: query, $options: 'i' } };
        // Optional: constrain query to user's region if they are RegionalAdmin/Admin
        if (req.user.role === 'RegionalAdmin' || req.user.role === 'Admin' || req.user.role === 'Manager') {
             if (req.user.region) {
                 filter.region = req.user.region;
             }
        }
        
        const partners = await IndustryPartner.find(filter).limit(10);
        res.json(partners);
    } catch (error) {
        res.status(500).json({ message: 'Search Error' });
    }
});

router.post('/industry-partners/:id/link', requireRole('Admin', 'Manager'), async (req, res) => {
    try {
        if (!req.user.institution) return res.status(400).json({ message: 'User has no assigned institution' });
        
        const partner = await IndustryPartner.findById(req.params.id);
        if (!partner) return res.status(404).json({ message: 'Partner not found' });
        
        if (!partner.linkedInstitutions.includes(req.user.institution)) {
            partner.linkedInstitutions.push(req.user.institution);
            await partner.save();
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'IndustryPartner',
                entityId: partner._id,
                summary: `Linked institution ${req.user.institution} to partner ${partner.name}`,
                metadata: { linkedInstitution: req.user.institution },
                changedFields: ['linkedInstitutions'],
                after: partner,
            });
        }
        res.json(partner);
    } catch (error) {
        res.status(500).json({ message: 'Error linking partner' });
    }
});

router.post('/industry-partners', requireRole('SuperAdmin', 'RegionalAdmin', 'Admin', 'Manager'), async (req, res) => {
    try {
        const newPartner = new IndustryPartner({
            ...req.body,
            addedBy: req.user._id
        });
        
        if (req.user.institution) {
            newPartner.linkedInstitutions = [req.user.institution];
        }
        
        await newPartner.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'IndustryPartner',
            entityId: newPartner._id,
            summary: `Created industry partner ${newPartner.name}`,
            after: newPartner,
        });
        res.status(201).json(newPartner);
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'Company name already exists! Please search and link the existing partner instead.' });
        res.status(500).json({ message: 'Error creating industry partner' });
    }
});

router.put('/industry-partners/:id', requireRole('SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const existingPartner = await IndustryPartner.findById(req.params.id);
        const updatedPartner = await IndustryPartner.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (updatedPartner && existingPartner) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'IndustryPartner',
                entityId: updatedPartner._id,
                summary: `Updated industry partner ${updatedPartner.name}`,
                before: existingPartner,
                after: updatedPartner,
            });
        }
        res.json(updatedPartner);
    } catch (error) {
        res.status(500).json({ message: 'Error updating partner' });
    }
});

router.delete('/industry-partners/:id', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const deletedPartner = await IndustryPartner.findByIdAndDelete(req.params.id);
        if (deletedPartner) {
            await logAuditEvent({
                req,
                action: 'DELETE',
                entityType: 'IndustryPartner',
                entityId: deletedPartner._id,
                summary: `Deleted industry partner ${deletedPartner.name}`,
                before: deletedPartner,
            });
        }
        res.json({ message: 'Industry partner deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting partner' });
    }
});

// ==================== PARTNER PORTAL ====================

router.post('/industry-partners/:id/create-account', requireRole('SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const partner = await IndustryPartner.findById(req.params.id);
        if (!partner) return res.status(404).json({ message: 'Partner not found' });
        if (!partner.contactEmail) return res.status(400).json({ message: 'Partner has no contact email' });

        const existingUser = await User.findOne({ email: partner.contactEmail });
        if (existingUser) {
            return res.status(400).json({ message: 'Account already exists for this email' });
        }

        const defaultPassword = 'Partner123!';
        const newUser = new User({
            name: partner.contactPerson,
            email: partner.contactEmail,
            password: defaultPassword,
            role: 'IndustryPartner',
            phone: partner.contactPhone,
            institution: 'N/A',
            partnerId: partner._id
        });

        await newUser.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'User',
            entityId: newUser._id,
            summary: `Created partner portal account for ${partner.name}`,
            after: newUser,
            metadata: { partnerId: partner._id },
        });
        res.json({ message: 'Account created successfully', defaultPassword });
    } catch (error) {
        res.status(500).json({ message: 'Error creating partner account', error: error.message });
    }
});

router.get('/partner-portal/placements', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const partnerId = getPartnerId(req.user);
        const settings = await getOrCreateSystemSettings();
        const placements = await Placement.find({ partner: partnerId })
            .populate('learner')
            .populate('owner', 'name role institution')
            .populate('partnerSupervisor', 'name email phone')
            .sort({ startDate: -1 });

        const placementIds = placements.map((placement) => placement._id);
        const learnerIds = placements.map((placement) => placement.learner?._id).filter(Boolean);

        const [messages, attendanceLogs, evaluations, supportTickets, agreements] = await Promise.all([
            PlacementMessage.find({ placement: { $in: placementIds } }).select('placement createdAt senderUser readBy').lean(),
            AttendanceLog.find({ placement: { $in: placementIds } }).select('placement periodEnd status submittedSource').sort({ periodEnd: -1 }).lean(),
            EmployerEvaluation.find({ partner: partnerId, learner: { $in: learnerIds } })
                .select('learner evaluatorName evaluatorPosition evaluationDate overallScore strengths areasForImprovement wouldHire additionalComments metrics version isCurrent supersedes')
                .sort({ version: -1, evaluationDate: -1 })
                .lean(),
            SupportTicket.find({ partnerId, status: { $in: ['Open', 'InProgress'] } })
                .select('learner placement subject requesterRole awaitingParty updatedAt')
                .lean(),
            PlacementAgreement.find({ placement: { $in: placementIds } }).lean(),
        ]);

        const unreadByPlacement = new Map();
        messages.forEach((message) => {
            const key = message.placement.toString();
            const current = unreadByPlacement.get(key) || { unreadCount: 0, lastMessageAt: null };
            const hasRead = (message.readBy || []).some((readerId) => readerId.toString() === req.user._id.toString());
            const isOwnMessage = message.senderUser?.toString() === req.user._id.toString();
            if (!isOwnMessage && !hasRead) current.unreadCount += 1;
            if (!current.lastMessageAt || new Date(message.createdAt) > new Date(current.lastMessageAt)) {
                current.lastMessageAt = message.createdAt;
            }
            unreadByPlacement.set(key, current);
        });

        const attendanceByPlacement = new Map();
        attendanceLogs.forEach((log) => {
            const key = log.placement.toString();
            if (!attendanceByPlacement.has(key)) {
                attendanceByPlacement.set(key, log);
            }
        });

        const evaluationsByLearner = new Map();
        const evaluationHistoryByLearner = new Map();
        evaluations.forEach((evaluation) => {
            const key = evaluation.learner.toString();
            if (!evaluationHistoryByLearner.has(key)) {
                evaluationHistoryByLearner.set(key, []);
            }
            evaluationHistoryByLearner.get(key).push(evaluation);
            if (!evaluationsByLearner.has(key) || evaluation.isCurrent) {
                evaluationsByLearner.set(key, evaluation);
            }
        });

        const supportByPlacement = new Map();
        supportTickets.forEach((ticket) => {
            const placementKey = ticket.placement?.toString();
            if (!placementKey) return;
            const existing = supportByPlacement.get(placementKey) || [];
            existing.push(ticket);
            supportByPlacement.set(placementKey, existing);
        });
        const agreementsByPlacement = new Map(agreements.map((agreement) => [agreement.placement.toString(), agreement]));

        res.json(placements.map((placement) => {
            const placementJson = placement.toObject();
            const unread = unreadByPlacement.get(placement._id.toString());
            const latestAttendance = attendanceByPlacement.get(placement._id.toString());
            const evaluation = placement.learner?._id ? evaluationsByLearner.get(placement.learner._id.toString()) : null;
            const evaluationHistory = placement.learner?._id ? (evaluationHistoryByLearner.get(placement.learner._id.toString()) || []) : [];
            const daysUntilEvaluationDue = placement.endDate
                ? Math.ceil((new Date(placement.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;
            const evaluationDueSoon = daysUntilEvaluationDue !== null ? daysUntilEvaluationDue <= 14 : false;
            const attendanceDueAt = latestAttendance
                ? new Date(new Date(latestAttendance.periodEnd).getTime() + settings.attendanceCadenceDays * 24 * 60 * 60 * 1000)
                : placement.startDate
                    ? new Date(new Date(placement.startDate).getTime() + settings.attendanceCadenceDays * 24 * 60 * 60 * 1000)
                    : null;

            return {
                ...placementJson,
                institutionOwner: placement.owner || null,
                partnerSupervisor: placement.partnerSupervisor || null,
                assignedToCurrentSupervisor: placement.partnerSupervisor
                    ? placement.partnerSupervisor._id.toString() === req.user._id.toString()
                    : false,
                operationalReadiness: buildPlacementOperationalReadiness(placementJson),
                unreadMessageCount: unread?.unreadCount || 0,
                lastMessageAt: unread?.lastMessageAt || null,
                latestAttendance: latestAttendance || null,
                attendanceDueAt,
                evaluationSubmitted: Boolean(evaluation),
                evaluationStatus: evaluation ? 'Completed' : 'Pending',
                evaluationDueSoon,
                daysUntilEvaluationDue,
                evaluation,
                evaluationHistory,
                openSupportCount: (supportByPlacement.get(placement._id.toString()) || []).length,
                agreementSummary: buildPlacementAgreementSummary({
                    placement,
                    learner: placement.learner,
                    agreement: agreementsByPlacement.get(placement._id.toString()) || null,
                }),
            };
        }));
    } catch (error) {
        res.status(500).json({ message: 'Error fetching partner placements' });
    }
});

router.get('/partner-portal/action-queue', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const partnerId = getPartnerId(req.user);
        const settings = await getOrCreateSystemSettings();
        const placements = await Placement.find({ partner: partnerId, status: 'Active' })
            .populate('learner', 'name trackingId program year')
            .populate('owner', 'name role institution')
            .populate('partnerSupervisor', 'name email phone')
            .sort({ startDate: 1 });

        const placementIds = placements.map((placement) => placement._id);
        const learnerIds = placements.map((placement) => placement.learner?._id).filter(Boolean);

        const [attendanceLogs, evaluations, messages, supportTickets] = await Promise.all([
            AttendanceLog.find({ placement: { $in: placementIds } }).select('placement periodEnd status submittedSource').sort({ periodEnd: -1 }).lean(),
            EmployerEvaluation.find({ partner: partnerId, learner: { $in: learnerIds } }).select('learner evaluationDate').lean(),
            PlacementMessage.find({ placement: { $in: placementIds } }).select('placement senderUser readBy createdAt').lean(),
            SupportTicket.find({ partnerId, status: { $in: ['Open', 'InProgress'] } })
                .select('subject learner placement requesterRole awaitingParty updatedAt')
                .lean(),
        ]);

        const attendanceByPlacement = new Map();
        attendanceLogs.forEach((log) => {
            const key = log.placement.toString();
            if (!attendanceByPlacement.has(key)) attendanceByPlacement.set(key, []);
            attendanceByPlacement.get(key).push(log);
        });

        const evaluationsByLearner = new Set(evaluations.map((evaluation) => evaluation.learner.toString()));

        const unreadMessageCounts = new Map();
        messages.forEach((message) => {
            const key = message.placement.toString();
            const hasRead = (message.readBy || []).some((readerId) => readerId.toString() === req.user._id.toString());
            const isOwnMessage = message.senderUser?.toString() === req.user._id.toString();
            if (!isOwnMessage && !hasRead) {
                unreadMessageCounts.set(key, (unreadMessageCounts.get(key) || 0) + 1);
            }
        });

        const supportByPlacement = new Map();
        supportTickets.forEach((ticket) => {
            const key = ticket.placement?.toString();
            if (!key) return;
            if (!supportByPlacement.has(key)) supportByPlacement.set(key, []);
            supportByPlacement.get(key).push(ticket);
        });

        const actionItems = [];
        const now = Date.now();

        placements.forEach((placement) => {
            const placementId = placement._id.toString();
            const learner = placement.learner;
            if (!learner) return;
            const partnerSupervisorId = placement.partnerSupervisor?._id?.toString();

            if (!partnerSupervisorId) {
                actionItems.push({
                    type: 'Supervisor Assignment',
                    placementId,
                    learnerId: learner._id,
                    learnerName: learner.name,
                    trackingId: learner.trackingId,
                    message: 'This placement has not been assigned to a company supervisor yet.',
                    actionUrl: '/partner-dashboard',
                    severity: 'medium',
                });
            }

            if (partnerSupervisorId && partnerSupervisorId !== req.user._id.toString()) {
                return;
            }

            const logs = attendanceByPlacement.get(placementId) || [];
            const latestLog = logs[0] || null;
            const attendanceDueAt = latestLog
                ? new Date(new Date(latestLog.periodEnd).getTime() + settings.attendanceCadenceDays * 24 * 60 * 60 * 1000)
                : placement.startDate
                    ? new Date(new Date(placement.startDate).getTime() + settings.attendanceCadenceDays * 24 * 60 * 60 * 1000)
                    : null;

            if (attendanceDueAt && attendanceDueAt.getTime() < now) {
                actionItems.push({
                    type: 'Overdue Hours',
                    placementId,
                    learnerId: learner._id,
                    learnerName: learner.name,
                    trackingId: learner.trackingId,
                    message: `Hours are overdue. Expected by ${attendanceDueAt.toLocaleDateString()}.`,
                    actionUrl: `/attendance-logs?learnerId=${learner._id}`,
                    severity: 'high',
                });
            }

            const returnedLog = logs.find((log) => log.status === 'Rejected');
            if (returnedLog) {
                actionItems.push({
                    type: 'Returned Hours',
                    placementId,
                    learnerId: learner._id,
                    learnerName: learner.name,
                    trackingId: learner.trackingId,
                    message: 'A submitted hours entry was returned and needs correction.',
                    actionUrl: `/attendance-logs?learnerId=${learner._id}`,
                    severity: 'high',
                });
            }

            if (!evaluationsByLearner.has(learner._id.toString()) && placement.endDate) {
                const daysUntilEnd = Math.ceil((new Date(placement.endDate).getTime() - now) / (1000 * 60 * 60 * 24));
                if (daysUntilEnd <= 14) {
                    actionItems.push({
                        type: 'Evaluation Due',
                        placementId,
                        learnerId: learner._id,
                        learnerName: learner.name,
                        trackingId: learner.trackingId,
                        message: `Employer evaluation is due in ${Math.max(daysUntilEnd, 0)} day(s).`,
                        actionUrl: `/partner-dashboard`,
                        severity: daysUntilEnd <= 3 ? 'high' : 'medium',
                    });
                }
            }

            if (unreadMessageCounts.get(placementId)) {
                actionItems.push({
                    type: 'Unread Messages',
                    placementId,
                    learnerId: learner._id,
                    learnerName: learner.name,
                    trackingId: learner.trackingId,
                    message: `${unreadMessageCounts.get(placementId)} unread placement message(s).`,
                    actionUrl: `/partner-dashboard`,
                    severity: 'medium',
                });
            }

            const readiness = buildPlacementOperationalReadiness(placement);
            if (!readiness.isOperational) {
                actionItems.push({
                    type: 'Supervisor Setup',
                    placementId,
                    learnerId: learner._id,
                    learnerName: learner.name,
                    trackingId: learner.trackingId,
                    message: `Placement is missing ${readiness.missingFields.join(', ')}.`,
                    actionUrl: `/partner-dashboard`,
                    severity: 'medium',
                });
            }

            const partnerTickets = supportByPlacement.get(placementId) || [];
            const awaitingPartner = partnerTickets.find((ticket) => ticket.awaitingParty === 'Partner');

            if (awaitingPartner) {
                actionItems.push({
                    type: 'Support Follow-up',
                    placementId,
                    learnerId: learner._id,
                    learnerName: learner.name,
                    trackingId: learner.trackingId,
                    message: `Support ticket "${awaitingPartner.subject}" is awaiting your response.`,
                    actionUrl: `/support-center?ticket=${awaitingPartner._id}`,
                    severity: 'medium',
                });
            }
        });

        res.json(actionItems);
    } catch (error) {
        console.error('Error fetching partner action queue:', error);
        res.status(500).json({ message: 'Error fetching partner action queue' });
    }
});

router.get('/partner-portal/supervisors', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const partnerId = getPartnerId(req.user);
        const supervisors = await User.find({
            role: 'IndustryPartner',
            status: 'Active',
            partnerId,
        }).select('name email phone');

        res.json(supervisors);
    } catch (error) {
        console.error('Error fetching partner supervisors:', error);
        res.status(500).json({ message: 'Error fetching partner supervisors' });
    }
});

router.get('/partner-portal/performance', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const partnerId = getPartnerId(req.user);
        const settings = await getOrCreateSystemSettings();
        const supervisors = await User.find({
            role: 'IndustryPartner',
            status: 'Active',
            partnerId,
        }).select('name email phone').lean();

        const placements = await Placement.find({ partner: partnerId, status: 'Active' })
            .populate('learner', 'name trackingId program')
            .populate('partnerSupervisor', 'name email phone')
            .select('learner companyName startDate endDate partnerSupervisor')
            .lean();

        const placementIds = placements.map((placement) => placement._id);
        const learnerIds = placements.map((placement) => placement.learner?._id).filter(Boolean);

        const [attendanceLogs, evaluations, supportTickets, messages] = await Promise.all([
            AttendanceLog.find({ placement: { $in: placementIds } })
                .select('placement periodEnd status submittedSource createdAt')
                .sort({ periodEnd: -1, createdAt: -1 })
                .lean(),
            EmployerEvaluation.find({ partner: partnerId, learner: { $in: learnerIds }, isCurrent: true })
                .select('learner evaluationDate')
                .lean(),
            SupportTicket.find({ partnerId, status: { $in: ['Open', 'InProgress'] } })
                .select('placement awaitingParty resolutionDueAt status')
                .lean(),
            PlacementMessage.find({ placement: { $in: placementIds } })
                .select('placement senderUser readBy createdAt')
                .lean(),
        ]);

        const attendanceByPlacement = new Map();
        attendanceLogs.forEach((log) => {
            const key = log.placement.toString();
            if (!attendanceByPlacement.has(key)) attendanceByPlacement.set(key, []);
            attendanceByPlacement.get(key).push(log);
        });

        const evaluationsByLearner = new Set(evaluations.map((evaluation) => evaluation.learner.toString()));
        const supportByPlacement = new Map();
        supportTickets.forEach((ticket) => {
            const key = ticket.placement?.toString();
            if (!key) return;
            if (!supportByPlacement.has(key)) supportByPlacement.set(key, []);
            supportByPlacement.get(key).push(ticket);
        });

        const unreadMessagesByPlacement = new Map();
        messages.forEach((message) => {
            const key = message.placement.toString();
            const hasRead = (message.readBy || []).some((readerId) => readerId.toString() === req.user._id.toString());
            const isOwnMessage = message.senderUser?.toString() === req.user._id.toString();
            if (!isOwnMessage && !hasRead) {
                unreadMessagesByPlacement.set(key, (unreadMessagesByPlacement.get(key) || 0) + 1);
            }
        });

        const supervisorRows = new Map();
        supervisors.forEach((supervisor) => {
            supervisorRows.set(supervisor._id.toString(), {
                supervisor: {
                    _id: supervisor._id,
                    name: supervisor.name,
                    email: supervisor.email || '',
                    phone: supervisor.phone || '',
                },
                placementsOwned: 0,
                overdueHours: 0,
                pendingEvaluations: 0,
                openSupport: 0,
                slaBreaches: 0,
                unreadMessages: 0,
                placements: [],
            });
        });

        const unassignedSummary = {
            placementsOwned: 0,
            overdueHours: 0,
            pendingEvaluations: 0,
            openSupport: 0,
            slaBreaches: 0,
            unreadMessages: 0,
        };

        const now = Date.now();

        placements.forEach((placement) => {
            const placementId = placement._id.toString();
            const logs = attendanceByPlacement.get(placementId) || [];
            const latestLog = logs[0] || null;
            const attendanceDueAt = latestLog
                ? new Date(new Date(latestLog.periodEnd).getTime() + settings.attendanceCadenceDays * 24 * 60 * 60 * 1000)
                : placement.startDate
                    ? new Date(new Date(placement.startDate).getTime() + settings.attendanceCadenceDays * 24 * 60 * 60 * 1000)
                    : null;
            const overdueHours = Boolean(attendanceDueAt && attendanceDueAt.getTime() < now);
            const pendingEvaluation = Boolean(placement.learner?._id && !evaluationsByLearner.has(placement.learner._id.toString()));
            const linkedSupport = supportByPlacement.get(placementId) || [];
            const slaBreaches = linkedSupport.filter((ticket) => ticket.resolutionDueAt && new Date(ticket.resolutionDueAt).getTime() < now && !['Resolved', 'Closed'].includes(ticket.status)).length;
            const unreadMessages = unreadMessagesByPlacement.get(placementId) || 0;
            const supervisorId = placement.partnerSupervisor?._id?.toString();
            const row = supervisorId ? supervisorRows.get(supervisorId) : null;
            const placementSummary = {
                placementId,
                learnerName: placement.learner?.name || 'Unknown learner',
                trackingId: placement.learner?.trackingId || '',
                companyName: placement.companyName,
                overdueHours,
                pendingEvaluation,
                openSupport: linkedSupport.length,
                slaBreaches,
                unreadMessages,
            };

            if (row) {
                row.placementsOwned += 1;
                if (overdueHours) row.overdueHours += 1;
                if (pendingEvaluation) row.pendingEvaluations += 1;
                row.openSupport += linkedSupport.length;
                row.slaBreaches += slaBreaches;
                row.unreadMessages += unreadMessages;
                row.placements.push(placementSummary);
            } else {
                unassignedSummary.placementsOwned += 1;
                if (overdueHours) unassignedSummary.overdueHours += 1;
                if (pendingEvaluation) unassignedSummary.pendingEvaluations += 1;
                unassignedSummary.openSupport += linkedSupport.length;
                unassignedSummary.slaBreaches += slaBreaches;
                unassignedSummary.unreadMessages += unreadMessages;
            }
        });

        res.json({
            supervisors: Array.from(supervisorRows.values()).sort((a, b) => {
                if (b.overdueHours !== a.overdueHours) return b.overdueHours - a.overdueHours;
                if (b.pendingEvaluations !== a.pendingEvaluations) return b.pendingEvaluations - a.pendingEvaluations;
                return b.placementsOwned - a.placementsOwned;
            }),
            unassignedSummary,
        });
    } catch (error) {
        console.error('Error fetching partner performance analytics:', error);
        res.status(500).json({ message: 'Error fetching partner performance analytics' });
    }
});

router.put('/partner-portal/placements/:id/supervisor', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const partnerId = getPartnerId(req.user);
        const { partnerSupervisorId } = req.body;
        const placement = await Placement.findOne({ _id: req.params.id, partner: partnerId })
            .populate('partnerSupervisor', 'name email phone');

        if (!placement) {
            return res.status(404).json({ message: 'Placement not found' });
        }

        let supervisor = null;
        if (partnerSupervisorId) {
            supervisor = await User.findOne({
                _id: partnerSupervisorId,
                role: 'IndustryPartner',
                status: 'Active',
                partnerId,
            }).select('name email phone');

            if (!supervisor) {
                return res.status(400).json({ message: 'Invalid partner supervisor selection' });
            }
        }

        const before = placement.toObject();
        placement.partnerSupervisor = supervisor?._id || null;
        await placement.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'Placement',
            entityId: placement._id,
            summary: `Updated partner supervisor for placement ${placement._id}`,
            before,
            after: placement,
        });

        if (supervisor && supervisor._id.toString() !== req.user._id.toString()) {
            await notifyUsers({
                recipientIds: [supervisor._id],
                sender: req.user._id,
                type: 'partner',
                title: 'Placement assigned to you',
                message: `You have been assigned as supervisor for the placement at ${placement.companyName}.`,
                link: '/partner-dashboard?view=mine',
            });
        }

        const populatedPlacement = await Placement.findById(placement._id)
            .populate('learner')
            .populate('owner', 'name role institution')
            .populate('partnerSupervisor', 'name email phone');

        res.json(populatedPlacement);
    } catch (error) {
        console.error('Error updating partner supervisor assignment:', error);
        res.status(500).json({ message: 'Error updating partner supervisor assignment' });
    }
});

router.post('/partner-portal/placements/:id/employer-agreement-sign', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const placement = await Placement.findOne({ _id: req.params.id, partner: getPartnerId(req.user) })
            .populate('learner', 'name trackingId program')
            .populate('partnerSupervisor', 'name');

        if (!placement) {
            return res.status(404).json({ message: 'Placement not found' });
        }

        if (!canActOnPartnerPlacement(req.user, placement)) {
            return res.status(403).json({ message: 'This placement is assigned to another supervisor' });
        }

        const { signerName, businessRepresentativeName, signatureName } = req.body;
        if (!signerName?.trim() || !signatureName?.trim()) {
            return res.status(400).json({ message: 'Employer signer name and signature are required' });
        }

        let agreement = await PlacementAgreement.findOne({ placement: placement._id });
        if (!agreement) {
            agreement = new PlacementAgreement({
                placement: placement._id,
                learner: placement.learner?._id || placement.learner,
                partner: placement.partner?._id || placement.partner || null,
                institution: placement.institution,
            });
        }

        const before = agreement.toObject();
        agreement.employerAcknowledgement = {
            signed: true,
            signerName: signerName.trim(),
            businessRepresentativeName: businessRepresentativeName?.trim() || placement.companyName,
            signatureName: signatureName.trim(),
            signedAt: new Date(),
            signedByUser: req.user._id,
        };
        await agreement.save();

        await logAuditEvent({
            req,
            action: before?._id ? 'UPDATE' : 'CREATE',
            entityType: 'PlacementAgreement',
            entityId: agreement._id,
            summary: `Recorded employer acknowledgement for placement ${placement._id}`,
            before,
            after: agreement,
        });

        res.json({
            agreement,
            agreementSummary: buildPlacementAgreementSummary({
                placement,
                learner: placement.learner,
                agreement,
            }),
        });
    } catch (error) {
        console.error('Error signing employer agreement:', error);
        res.status(500).json({ message: 'Error signing employer agreement' });
    }
});

router.post('/partner-portal/evaluations', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const placement = await Placement.findOne({
            learner: req.body.learner,
            partner: req.user.partnerId,
            status: 'Active',
        }).populate('partnerSupervisor', 'name');

        if (!placement) {
            return res.status(404).json({ message: 'Active placement not found for learner' });
        }

        if (!canActOnPartnerPlacement(req.user, placement)) {
            return res.status(403).json({ message: `This learner is assigned to ${placement.partnerSupervisor?.name || 'another supervisor'}` });
        }

        const previousEvaluation = await EmployerEvaluation.findOne({
            partner: req.user.partnerId,
            learner: req.body.learner,
            isCurrent: true,
        }).sort({ version: -1 });

        if (previousEvaluation) {
            previousEvaluation.isCurrent = false;
            await previousEvaluation.save();
        }

        const newEval = new EmployerEvaluation({
            ...req.body,
            partner: req.user.partnerId,
            version: (previousEvaluation?.version || 0) + 1,
            isCurrent: true,
            supersedes: previousEvaluation?._id || null,
        });
        await newEval.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'EmployerEvaluation',
            entityId: newEval._id,
            summary: `Created employer evaluation ${newEval._id} (v${newEval.version})`,
            after: newEval,
        });
        res.status(201).json(newEval);
    } catch (error) {
        res.status(500).json({ message: 'Error saving evaluation', error: error.message });
    }
});

router.get('/partner-portal/evaluations', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const evals = await EmployerEvaluation.find({ partner: req.user.partnerId })
            .populate('learner')
            .sort({ learner: 1, version: -1 });
        res.json(evals);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching evaluations' });
    }
});

// Admin endpoint to view evaluations for a specific learner
router.get('/evaluations/learner/:learnerId', async (req, res) => {
    try {
        const evals = await EmployerEvaluation.find({ learner: req.params.learnerId })
            .populate('partner')
            .sort({ evaluationDate: -1 });
        res.json(evals);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching evaluations' });
    }
});

// ==================== PLACEMENT REQUESTS ====================

router.get('/placement-requests', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const requests = await PlacementRequest.find(filter)
            .populate('partner', 'name sector region totalSlots usedSlots')
            .populate('learners', 'firstName lastName trackingId')
            .populate('submittedBy', 'name')
            .sort({ createdAt: -1 });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/placement-requests', async (req, res) => {
    try {
        const { partner, learners, program, requestedSlots, startDate, endDate } = req.body;
        const readinessCheck = await assertLearnersReadyForPlacement(learners, req.user.institution);
        if (!readinessCheck.ok) {
            return res.status(400).json({ message: `Learner readiness check failed: ${readinessCheck.message}` });
        }
        
        // Prevent requesting more slots than available
        const partnerDoc = await IndustryPartner.findById(partner);
        if (!partnerDoc) return res.status(404).json({ message: 'Partner not found' });
        if (partnerDoc.totalSlots - partnerDoc.usedSlots < requestedSlots) {
            return res.status(400).json({ message: 'Requested slots exceed available capacity' });
        }

        // Check capacity again to be safe
        const pDoc = await IndustryPartner.findById(partner);
        if (pDoc.totalSlots - pDoc.usedSlots < requestedSlots) {
            return res.status(400).json({ message: 'Partner no longer has enough capacity' });
        }

        try {
            const placementAcademicYear = startDate
              ? resolveAcademicYearFromDate(startDate)
              : await resolveCurrentAcademicYear();
            const newRequest = new PlacementRequest({
                institution: req.user.institution,
                partner,
                learners,
                program,
                requestedSlots,
                startDate,
                endDate,
                submittedBy: req.user._id,
                status: 'Placed'
            });
            await newRequest.save();
            await logAuditEvent({
                req,
                action: 'CREATE',
                entityType: 'PlacementRequest',
                entityId: newRequest._id,
                summary: `Processed placement request for ${requestedSlots} learner(s)`,
                after: newRequest,
            });

            // Update partner slot capacity
            await IndustryPartner.findByIdAndUpdate(partner, {
                $inc: { usedSlots: requestedSlots }
            });

            // Create Placements for each learner and update learner status
            const placementDocs = learners.map(learnerId => ({
                learner: learnerId,
                academicYear: placementAcademicYear,
                companyName: partnerDoc.name,
                partner: partnerDoc._id,
                startDate,
                endDate,
                sector: partnerDoc.sector,
                location: partnerDoc.location || partnerDoc.region,
                institution: req.user.institution,
                status: 'Active'
            }));

            const createdPlacements = await Placement.insertMany(placementDocs);

            // Update each learner's status and placement ref
            for (const placement of createdPlacements) {
                await Learner.findByIdAndUpdate(placement.learner, {
                    status: 'Placed',
                    placement: placement._id
                });
            }

            await logAuditEvent({
                req,
                action: 'CREATE',
                entityType: 'Placement',
                entityId: createdPlacements.map((placement) => placement._id).join(','),
                summary: `Created ${createdPlacements.length} placement(s) from approved partner request`,
                metadata: { placementRequestId: newRequest._id, learnerCount: createdPlacements.length },
                after: createdPlacements,
            });

            // Notify Institution
            const firstLearner = await Learner.findById(learners[0]);
            const learnerName = firstLearner ? firstLearner.name : 'Multiple Learners';
            const trackingId = firstLearner ? firstLearner.trackingId : 'N/A';
            
            notifyInstitutionAdmins(req.user.institution, sendPlacementApprovalEmail, learnerName, partnerDoc.name, trackingId);

            notifyUsers({
                partnerId: partnerDoc._id,
                sender: req.user._id,
                type: 'placement',
                title: 'New Learners Placed',
                message: `${requestedSlots} new learners from ${req.user.institution} have been officially placed with your organization.`,
                link: '/partner-dashboard?view=mine'
            });

            res.status(201).json(newRequest);
        } catch (err) {
            return res.status(400).json({ message: err.message });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error processing placement' });
    }
});


export default router;
