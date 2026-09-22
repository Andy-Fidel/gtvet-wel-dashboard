import crypto from 'node:crypto';
import { isInspection } from './inspectionContext.js';
import { AcademicState } from '../models/AcademicState.js';
import { AcademicTerm } from '../models/AcademicTerm.js';
import { AcademicCalendar } from '../models/AcademicCalendar.js';

export const academicError = (message, status = 409) => Object.assign(new Error(message), { status });
export const academicErrorStatus = error => error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500);
export const pickFields = (body, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(body || {}, key)).map(key => [key, body[key]]));
export const YEAR_GROUPS = ['Year 1', 'Year 2', 'Year 3'];
export const termFields = ['name', 'academicYear', 'termType', 'startDate', 'endDate', 'yearGroupSchedules', 'status', 'isCurrent', 'notes'];
export const calendarFields = ['title', 'description', 'startDate', 'endDate', 'eventType', 'semester', 'academicYear', 'institutionCalendarType', 'targetYearGroup', 'totalWeeks', 'hoursPerDay', 'sourceLabel', 'isActive'];
export const validAcademicYear = value => {
  const match = /^(\d{4})\/(\d{4})$/.exec(value || '');
  return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
};

export function termYearGroupSchedules(term) {
  const value = term?.toObject ? term.toObject() : term;
  const configured = Array.isArray(value?.yearGroupSchedules) ? value.yearGroupSchedules : [];
  return YEAR_GROUPS.map(yearGroup => {
    const schedule = configured.find(item => item?.yearGroup === yearGroup);
    return {
      yearGroup,
      startDate: schedule?.startDate || value?.startDate,
      endDate: schedule?.endDate || value?.endDate,
    };
  });
}

export function termScheduleForYearGroup(term, yearGroup) {
  return termYearGroupSchedules(term).find(schedule => schedule.yearGroup === yearGroup) || null;
}

export async function getAcademicState() {
  let state = await AcademicState.findById('global').lean();
  if (state) return state;
  const legacy = await AcademicTerm.find({ archived: { $ne: true }, $or: [{ isCurrent: true }, { status: 'Active' }] }).sort({ isCurrent: -1, startDate: -1 }).lean();
  if (legacy.filter(term => term.isCurrent).length > 1 || (!legacy.some(term => term.isCurrent) && legacy.length > 1)) {
    throw academicError('Multiple legacy current/active terms need reconciliation before academic settings can be changed.');
  }
  try {
    if (isInspection()) return { _id: 'global', currentTerm: legacy[0]?._id || null, completedTerms: [] };
    state = await AcademicState.findOneAndUpdate({ _id: 'global' }, { $setOnInsert: { currentTerm: legacy[0]?._id || null, completedTerms: [] } }, { upsert: true, returnDocument: 'after' }).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    state = await AcademicState.findById('global').lean();
    if (!state) throw error;
  }
  return state;
}

export function effectiveTerm(term, state) {
  const value = term.toObject ? term.toObject() : term;
  const current = String(state.currentTerm) === String(value._id);
  const completed = (state.completedTerms || []).some(id => String(id) === String(value._id));
  const schedules = value.startDate && value.endDate ? { yearGroupSchedules: termYearGroupSchedules(value) } : {};
  return { ...value, ...schedules, isCurrent: current, status: current ? 'Active' : completed ? 'Completed' : value.status === 'Active' ? 'Planned' : value.status };
}

export async function currentAcademicTerm() {
  const state = await getAcademicState();
  if (!state.currentTerm) return null;
  const term = await AcademicTerm.findById(state.currentTerm).lean();
  if (!term || term.archived) throw academicError('The current academic term is unavailable.');
  return effectiveTerm(term, state);
}

export async function withAcademicLock(work) {
  await getAcademicState();
  const token = crypto.randomUUID();
  const state = await AcademicState.findOneAndUpdate({ _id: 'global', $or: [{ lockUntil: { $exists: false } }, { lockUntil: { $lte: new Date() } }] },
    { $set: { lockToken: token, lockUntil: new Date(Date.now() + 120000) } }, { returnDocument: 'after' }).lean();
  if (!state) throw academicError('Another academic settings update is in progress. Retry shortly.');
  try { return await work(state); }
  finally { await AcademicState.updateOne({ _id: 'global', lockToken: token }, { $unset: { lockToken: 1, lockUntil: 1 } }); }
}

export async function activateTerm(term, state, previous = null) {
  if (term.archived || term.status === 'Completed' || (state.completedTerms || []).some(id => String(id) === String(term._id))) throw academicError('Only a planned term can be activated.');
  if (previous && (String(previous._id) === String(term._id) || new Date(term.startDate) <= new Date(previous.endDate))) {
    throw academicError('The next term must start after the current term ends.');
  }
  const update = { $set: { currentTerm: term._id } };
  if (previous) update.$addToSet = { completedTerms: previous._id };
  const result = await AcademicState.findOneAndUpdate({ _id: 'global', lockToken: state.lockToken, currentTerm: state.currentTerm || null, lockUntil: { $gt: new Date() } }, update, { returnDocument: 'after' }).lean();
  if (!result) throw academicError('Academic settings changed during this request. Refresh and retry.');
  return effectiveTerm(term, result);
}

export async function validateWindowTerm(event) {
  if (event.eventType !== 'WEL Window' || !event.isActive) return;
  const terms = await AcademicTerm.find({ academicYear: event.academicYear, termType: event.semester, archived: { $ne: true } }).lean();
  if (terms.length !== 1) throw academicError('Configure exactly one matching academic term in Settings before activating this WEL window.');
  const term = terms[0];
  const schedule = termScheduleForYearGroup(term, event.targetYearGroup);
  if (!schedule?.startDate || !schedule?.endDate) throw academicError(`Configure semester dates for ${event.targetYearGroup} before activating this WEL window.`);
  if (new Date(event.startDate) < new Date(schedule.startDate) || new Date(event.endDate) > new Date(schedule.endDate)) {
    const date = value => new Date(value).toISOString().slice(0, 10);
    throw academicError(`The WEL window must fall within the ${event.targetYearGroup} semester dates (${term.name || term.termType}, ${event.academicYear}: ${date(schedule.startDate)} to ${date(schedule.endDate)}). Your window is ${date(event.startDate)} to ${date(event.endDate)}. Review the year-group dates in Settings or save as a draft.`);
  }
}

export async function validateTermWindows(term) {
  const windows = await AcademicCalendar.find({ eventType: 'WEL Window', isActive: true, academicYear: term.academicYear, semester: term.termType }).lean();
  if (windows.some(window => {
    const schedule = termScheduleForYearGroup(term, window.targetYearGroup);
    return !schedule || new Date(window.startDate) < new Date(schedule.startDate) || new Date(window.endDate) > new Date(schedule.endDate);
  })) {
    throw academicError('Year-group schedules must include the active WEL windows. Review those windows before changing the term.');
  }
}

export function termCalendarEvents(terms) {
  return terms.flatMap(term => termYearGroupSchedules(term).flatMap(schedule => [
    { id: `term-start-${term._id}-${schedule.yearGroup}`, title: `${term.name} · ${schedule.yearGroup} starts`, start: schedule.startDate, eventType: 'Semester Start', color: '#8B5CF6' },
    { id: `term-end-${term._id}-${schedule.yearGroup}`, title: `${term.name} · ${schedule.yearGroup} ends`, start: schedule.endDate, eventType: 'Semester End', color: '#EC4899' },
  ].map(event => ({ ...event, type: 'academic', description: `${schedule.yearGroup} · ${term.termType} · ${term.academicYear} · Academic Terms in Settings` }))));
}
