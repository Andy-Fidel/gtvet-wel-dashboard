import crypto from 'node:crypto';
import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import { Institution } from '../models/Institution.js';
import { Learner } from '../models/Learner.js';
import { logAuditEvent } from '../utils/audit.js';
import {
  buildIdmsSyncPlan,
  checkIdmsConnection,
  fetchIdmsLearners,
  idmsConfiguration,
} from '../utils/idmsLearnerSync.js';

const router = express.Router();
const SYNC_ROLES = ['Admin', 'Manager'];
const STATUS_ROLES = ['SuperAdmin', 'RegionalAdmin', 'Admin', 'Manager'];
const ACADEMIC_YEAR_PATTERN = /^\d{4}\/\d{4}$/;
const activeInstitutionSyncs = new Set();

router.use(auth);

const resolveAcademicYear = (req) => {
  const academicYear = String(req.query.academicYear || req.body?.academicYear || '').trim();
  if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) {
    const error = new Error('Academic year must use YYYY/YYYY format');
    error.status = 400;
    throw error;
  }
  return academicYear;
};

const resolveInstitution = async (req) => {
  const institution = await Institution.findOne({ name: req.user.institution });
  if (!institution) {
    const error = new Error('Your WEL institution record was not found');
    error.status = 404;
    throw error;
  }
  return institution;
};

const assertSyncReady = (institution) => {
  const configuration = idmsConfiguration();
  if (!configuration.enabled) {
    const error = new Error('IDMS synchronization is disabled for this deployment');
    error.status = 503;
    throw error;
  }
  if (!configuration.tokenConfigured) {
    const error = new Error('IDMS service credential is not configured');
    error.status = 503;
    throw error;
  }
  if (!institution.idmsSyncEnabled) {
    const error = new Error('IDMS synchronization is not enabled for your institution');
    error.status = 409;
    throw error;
  }
  if (!institution.idmsInstitutionId) {
    const error = new Error('Your institution is not mapped to an IDMS institution');
    error.status = 409;
    throw error;
  }
};

const loadSyncPlan = async ({ institution, academicYear }) => {
  const remoteLearners = await fetchIdmsLearners({ institutionId: institution.idmsInstitutionId, academicYear });
  const remoteIds = remoteLearners
    .map((learner) => String(learner?.public_id || learner?.id || '').trim())
    .filter(Boolean);
  const localLearners = await Learner.find({
    $or: [
      { institution: institution.name },
      ...(remoteIds.length > 0 ? [{ idmsLearnerId: { $in: remoteIds } }] : []),
    ],
  }).lean();
  return buildIdmsSyncPlan({ remoteLearners, localLearners, academicYear, institutionName: institution.name });
};

const publicPreview = (plan) => ({
  summary: plan.summary,
  total: plan.total,
  conflicts: plan.items
    .filter((item) => ['conflict', 'invalid'].includes(item.type))
    .slice(0, 100)
    .map((item) => ({
      type: item.type,
      idmsLearnerId: item.mapped.idmsLearnerId,
      indexNumber: item.mapped.indexNumber,
      name: [item.mapped.firstName, item.mapped.middleName, item.mapped.lastName].filter(Boolean).join(' '),
      errors: item.errors || [],
    })),
});

const compactPayload = (payload) => Object.fromEntries(
  Object.entries(payload).filter(([, value]) => value !== undefined)
);

const trackingId = () => `WEL-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

router.get('/status', requireRole(...STATUS_ROLES), async (req, res) => {
  try {
    const institution = await resolveInstitution(req);
    const configuration = idmsConfiguration();
    const academicYear = resolveAcademicYear(req);
    const response = {
      enabled: configuration.enabled,
      credentialConfigured: configuration.tokenConfigured,
      institutionMapped: Boolean(institution.idmsInstitutionId),
      institutionEnabled: Boolean(institution.idmsSyncEnabled),
      institutionId: institution.idmsInstitutionId || '',
      lastSyncAt: institution.lastIdmsSyncAt || null,
      lastSyncAcademicYear: institution.lastIdmsSyncAcademicYear || '',
      connected: false,
    };

    if (!configuration.enabled || !configuration.tokenConfigured || !institution.idmsSyncEnabled || !institution.idmsInstitutionId) {
      return res.json(response);
    }

    await checkIdmsConnection({ institutionId: institution.idmsInstitutionId, academicYear });
    return res.json({ ...response, connected: true });
  } catch (error) {
    return res.status(error.status || 502).json({
      connected: false,
      message: error.message || 'IDMS connection check failed',
    });
  }
});

router.get('/learner-sync/preview', requireRole(...SYNC_ROLES), async (req, res) => {
  try {
    const academicYear = resolveAcademicYear(req);
    const institution = await resolveInstitution(req);
    assertSyncReady(institution);
    const plan = await loadSyncPlan({ institution, academicYear });
    return res.json({
      academicYear,
      institution: institution.name,
      ...publicPreview(plan),
    });
  } catch (error) {
    return res.status(error.status || 502).json({ message: error.message || 'Unable to preview IDMS learners' });
  }
});

router.post('/learner-sync', requireRole(...SYNC_ROLES), async (req, res) => {
  let syncLockKey = '';
  let syncLockAcquired = false;
  try {
    const academicYear = resolveAcademicYear(req);
    const institution = await resolveInstitution(req);
    assertSyncReady(institution);
    syncLockKey = String(institution._id);
    if (activeInstitutionSyncs.has(syncLockKey)) {
      return res.status(409).json({ message: 'An IDMS learner synchronization is already running for this institution' });
    }
    activeInstitutionSyncs.add(syncLockKey);
    syncLockAcquired = true;
    const plan = await loadSyncPlan({ institution, academicYear });
    const now = new Date();
    const operations = [];

    for (const item of plan.items) {
      if (item.type === 'conflict' || item.type === 'invalid') continue;
      const syncPayload = compactPayload({
        ...item.mapped,
        lastIdmsSyncAt: now,
        idmsSyncStatus: 'Linked',
      });

      if (item.type === 'new') {
        operations.push({
          insertOne: {
            document: {
              ...syncPayload,
              trackingId: trackingId(),
              institution: institution.name,
              region: institution.region,
              status: 'Pending',
              progressionHistory: [{
                academicYear,
                action: 'Intake',
                fromYear: '',
                toYear: syncPayload.year,
                note: 'Learner synchronized from IDMS',
                changedBy: req.user._id,
                changedAt: now,
              }],
              createdAt: now,
              updatedAt: now,
            },
          },
        });
        continue;
      }

      const update = { $set: syncPayload };
      if (item.type === 'updated' && (item.changedFields.includes('year') || item.changedFields.includes('academicStatus') || item.changedFields.includes('idmsAcademicStatus'))) {
        const action = syncPayload.academicStatus === 'Graduated'
          ? 'Graduated'
          : syncPayload.academicStatus === 'Dropped'
            ? 'Dropped'
            : item.changedFields.includes('year')
              ? 'Promoted'
              : 'StatusAdjusted';
        update.$push = {
          progressionHistory: {
            academicYear,
            action,
            fromYear: item.existing.year || '',
            toYear: syncPayload.year || item.existing.year || '',
            note: 'Academic record synchronized from IDMS',
            changedBy: req.user._id,
            changedAt: now,
          },
        };
        if (syncPayload.academicStatus === 'Graduated') {
          update.$set.graduationAcademicYear = academicYear;
          update.$set.graduatedAt = item.existing.graduatedAt || now;
        }
      }
      operations.push({ updateOne: { filter: { _id: item.existing._id }, update } });
    }

    if (operations.length > 0) await Learner.bulkWrite(operations, { ordered: false });
    institution.lastIdmsSyncAt = now;
    institution.lastIdmsSyncAcademicYear = academicYear;
    await institution.save();

    const result = {
      academicYear,
      institution: institution.name,
      ...publicPreview(plan),
      syncedAt: now,
    };
    await logAuditEvent({
      req,
      action: 'UPLOAD',
      entityType: 'IdmsLearnerSync',
      entityId: `${institution._id}:${academicYear}:${now.getTime()}`,
      summary: `Synchronized IDMS learners for ${institution.name}`,
      metadata: { ...plan.summary, academicYear, institutionId: institution.idmsInstitutionId },
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || (error.code === 11000 ? 409 : 502)).json({
      message: error.code === 11000
        ? 'Synchronization found a duplicate IDMS learner or tracking identifier. Preview and resolve conflicts before retrying.'
        : error.message || 'IDMS learner synchronization failed',
    });
  } finally {
    if (syncLockAcquired) activeInstitutionSyncs.delete(syncLockKey);
  }
});

export default router;
