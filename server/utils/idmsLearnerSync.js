const DEFAULT_IDMS_API_BASE = 'https://gtvet-idms-api-8466d2bbdaf1.herokuapp.com';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_PAGES = 100;
const PAGE_SIZE = 200;

const cleanString = (value) => String(value ?? '').trim();

export const normalizeIndexNumber = (value) => cleanString(value)
  .toUpperCase()
  .replace(/\s+/g, '')
  .replace(/[–—]/g, '-');

const normalizeAcademicYear = (value, fallback = '') => {
  const text = cleanString(value);
  if (/^\d{4}\/\d{4}$/.test(text)) return text;
  const startYear = Number.parseInt(text, 10);
  if (Number.isInteger(startYear) && startYear >= 2000 && startYear <= 2100) {
    return `${startYear}/${startYear + 1}`;
  }
  return fallback;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const mapAcademicStatus = (status) => {
  switch (cleanString(status).toLowerCase()) {
    case 'graduated': return 'Graduated';
    case 'withdrawn': return 'Dropped';
    case 'active':
    case 'repeated':
    default: return 'Active';
  }
};

const mapYearGroup = (value) => {
  const numericYear = Number.parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  return [1, 2, 3].includes(numericYear) ? `Year ${numericYear}` : '';
};

export const mapIdmsLearner = (record, { academicYear = '' } = {}) => {
  const idmsLearnerId = cleanString(record?.public_id || record?.id);
  const indexNumber = cleanString(record?.index_number);
  const firstName = cleanString(record?.first_name);
  const middleName = cleanString(record?.middle_name);
  const lastName = cleanString(record?.last_name);
  const program = cleanString(record?.programme_name || record?.program_name);
  const year = mapYearGroup(record?.current_year || record?.year_group);
  const errors = [];

  if (!idmsLearnerId) errors.push('Missing IDMS learner ID');
  if (!indexNumber) errors.push('Missing index number');
  if (!firstName) errors.push('Missing first name');
  if (!lastName) errors.push('Missing last name');
  if (!program) errors.push('Missing programme');
  if (!year) errors.push('Invalid year group');

  const mapped = {
    idmsLearnerId,
    idmsProgrammeId: cleanString(record?.programme_id || record?.program_id),
    idmsAcademicStatus: cleanString(record?.status).toLowerCase(),
    recordSource: 'IDMS',
    idmsUpdatedAt: normalizeDate(record?.updated_at || record?.modified_at),
    idmsSyncStatus: 'Linked',
    firstName,
    middleName,
    lastName,
    gender: ['Male', 'Female', 'Other'].includes(cleanString(record?.gender))
      ? cleanString(record.gender)
      : undefined,
    dateOfBirth: normalizeDate(record?.date_of_birth),
    phone: cleanString(record?.phone),
    guardianContact: cleanString(record?.guardian_contact),
    indexNumber,
    program,
    year,
    intakeAcademicYear: normalizeAcademicYear(record?.intake_year, academicYear),
    academicStatus: mapAcademicStatus(record?.status),
  };

  return { mapped, errors, source: record };
};

const comparableValue = (field, value) => {
  if (field === 'dateOfBirth' || field === 'idmsUpdatedAt') {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  if (field === 'indexNumber') return normalizeIndexNumber(value);
  return cleanString(value);
};

const SYNC_FIELDS = [
  'idmsLearnerId',
  'idmsProgrammeId',
  'idmsAcademicStatus',
  'recordSource',
  'firstName',
  'middleName',
  'lastName',
  'gender',
  'dateOfBirth',
  'phone',
  'guardianContact',
  'indexNumber',
  'program',
  'year',
  'intakeAcademicYear',
  'academicStatus',
];

const changedFields = (existing, mapped) => SYNC_FIELDS.filter(
  (field) => comparableValue(field, existing?.[field]) !== comparableValue(field, mapped?.[field])
);

export const buildIdmsSyncPlan = ({ remoteLearners, localLearners, academicYear = '', institutionName = '' }) => {
  const byIdmsId = new Map();
  const byIndexNumber = new Map();

  for (const learner of localLearners || []) {
    const idmsId = cleanString(learner.idmsLearnerId);
    if (idmsId) byIdmsId.set(idmsId, learner);
    const normalizedIndex = normalizeIndexNumber(learner.indexNumber);
    if (normalizedIndex) {
      const matches = byIndexNumber.get(normalizedIndex) || [];
      matches.push(learner);
      byIndexNumber.set(normalizedIndex, matches);
    }
  }

  const items = [];
  const remoteIdCounts = new Map();
  const remoteIndexCounts = new Map();
  for (const remote of remoteLearners || []) {
    const { mapped } = mapIdmsLearner(remote, { academicYear });
    const normalizedIndex = normalizeIndexNumber(mapped.indexNumber);
    if (mapped.idmsLearnerId) remoteIdCounts.set(mapped.idmsLearnerId, (remoteIdCounts.get(mapped.idmsLearnerId) || 0) + 1);
    if (normalizedIndex) remoteIndexCounts.set(normalizedIndex, (remoteIndexCounts.get(normalizedIndex) || 0) + 1);
  }

  for (const remote of remoteLearners || []) {
    const normalized = mapIdmsLearner(remote, { academicYear });
    const { mapped } = normalized;
    const normalizedIndex = normalizeIndexNumber(mapped.indexNumber);

    if (normalized.errors.length > 0) {
      items.push({ type: 'invalid', mapped, errors: normalized.errors });
      continue;
    }
    if ((remoteIdCounts.get(mapped.idmsLearnerId) || 0) > 1 || (remoteIndexCounts.get(normalizedIndex) || 0) > 1) {
      items.push({ type: 'conflict', mapped, errors: ['Duplicate learner in IDMS response'] });
      continue;
    }

    const idMatch = byIdmsId.get(mapped.idmsLearnerId);
    const indexMatches = byIndexNumber.get(normalizedIndex) || [];
    const indexMatch = indexMatches.length === 1 ? indexMatches[0] : null;

    if (indexMatches.length > 1) {
      items.push({ type: 'conflict', mapped, errors: ['Multiple WEL learners use this index number'] });
      continue;
    }
    if (idMatch && indexMatch && String(idMatch._id) !== String(indexMatch._id)) {
      items.push({ type: 'conflict', mapped, errors: ['IDMS learner ID and index number match different WEL learners'] });
      continue;
    }
    if (idMatch && institutionName && idMatch.institution && idMatch.institution !== institutionName) {
      items.push({ type: 'conflict', mapped, errors: ['IDMS learner is already linked to another WEL institution'] });
      continue;
    }

    const existing = idMatch || indexMatch;
    if (!existing) {
      items.push({ type: 'new', mapped, existing: null, changedFields: SYNC_FIELDS });
      continue;
    }

    const fields = changedFields(existing, mapped);
    items.push({
      type: fields.length > 0 ? 'updated' : 'unchanged',
      mapped,
      existing,
      changedFields: fields,
    });
  }

  const summary = items.reduce((counts, item) => {
    counts[item.type] += 1;
    return counts;
  }, { new: 0, updated: 0, unchanged: 0, conflict: 0, invalid: 0 });

  return { items, summary, total: items.length };
};

export const idmsConfiguration = () => ({
  enabled: process.env.IDMS_SYNC_ENABLED === 'true',
  apiBase: (process.env.IDMS_API_BASE || DEFAULT_IDMS_API_BASE).replace(/\/$/, ''),
  tokenConfigured: Boolean(process.env.IDMS_API_TOKEN),
  timeoutMs: Number(process.env.IDMS_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
});

const idmsRequest = async (path, { query = {} } = {}) => {
  const configuration = idmsConfiguration();
  if (!configuration.enabled) throw new Error('IDMS synchronization is disabled');
  if (!configuration.tokenConfigured) throw new Error('IDMS service credential is not configured');

  const target = new URL(`${configuration.apiBase}${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') target.searchParams.set(key, String(value));
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);
  try {
    const response = await fetch(target, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${process.env.IDMS_API_TOKEN}`,
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.detail || payload?.message || `IDMS returned ${response.status}`;
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('IDMS request timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchIdmsLearners = async ({ institutionId, academicYear }) => {
  const learners = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await idmsRequest('/m7/learners', {
      query: {
        institution_id: institutionId,
        academic_year: academicYear,
        paginated: true,
        page,
        page_size: PAGE_SIZE,
      },
    });
    const items = Array.isArray(payload) ? payload : payload?.items;
    if (!Array.isArray(items)) throw new Error('IDMS returned an unsupported learner response');
    learners.push(...items);
    const total = Number(payload?.total ?? learners.length);
    if (items.length < PAGE_SIZE || learners.length >= total) return learners;
  }
  throw new Error('IDMS learner response exceeded the supported page limit');
};

export const checkIdmsConnection = async ({ institutionId, academicYear }) => idmsRequest('/m7/stats', {
  query: {
    institution_id: institutionId,
    academic_year: academicYear,
  },
});
