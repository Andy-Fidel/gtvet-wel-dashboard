export const canWriteAssessment = user =>
  ['Admin', 'Manager', 'Staff'].includes(user?.role) && Boolean(user?.institution?.trim());

export const canReadAssessment = user => canWriteAssessment(user)
  || ['SuperAdmin', 'HQManager', 'HQStaff', 'RegionalAdmin'].includes(user?.role);

export const assessmentLearnerFields = 'firstName middleName lastName trackingId program';

export function serializeAssessment(value) {
  const assessment = value.toObject ? value.toObject() : value;
  const learner = assessment.learner;
  return {
    ...assessment,
    trackingId: learner?.trackingId || assessment.trackingId || '',
    learner: learner ? {
      ...learner,
      name: [learner.lastName, learner.middleName, learner.firstName].filter(Boolean).join(' ').trim()
        || learner.name || learner.trackingId || 'Learner unavailable',
    } : null,
  };
}

// Only assessment content is editable. Ownership and learner identity are server-controlled.
export function assessmentInput(body = {}) {
  const fields = ['assessmentDate', 'assessmentType', 'technicalSkills', 'softSkills',
    'professionalism', 'problemSolving', 'overallScore', 'assessorName', 'recommendations'];
  return Object.fromEntries(fields.filter(key => Object.hasOwn(body, key)).map(key => [key, body[key]]));
}

export function validateAssessmentInput(body = {}) {
  for (const field of ['professionalism', 'problemSolving', 'overallScore']) {
    if (Object.hasOwn(body, field) && (typeof body[field] !== 'number' || !Number.isFinite(body[field]))) {
      return `${field} must be a number`;
    }
  }
  for (const field of ['assessmentType', 'technicalSkills', 'softSkills', 'assessorName', 'recommendations']) {
    if (Object.hasOwn(body, field) && typeof body[field] !== 'string') return `${field} must be text`;
  }
  if (Object.hasOwn(body, 'assessmentDate') && (typeof body.assessmentDate !== 'string'
    || !body.assessmentDate.trim() || !Number.isFinite(Date.parse(body.assessmentDate)))) return 'Invalid assessment date';
  return null;
}

export const safeAssessmentCsvCell = value => typeof value === 'string' && /^[\s]*[=+@-]/.test(value)
  ? `'${value}` : value;
