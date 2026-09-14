import crypto from 'node:crypto';
import { AcademicState } from '../models/AcademicState.js';
import { AcademicTerm } from '../models/AcademicTerm.js';
import { AcademicCalendar } from '../models/AcademicCalendar.js';

export const academicError = (message, status = 409) => Object.assign(new Error(message), { status });
export const academicErrorStatus = error => error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500);
export const pickFields = (body, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(body || {}, key)).map(key => [key, body[key]]));
export const termFields = ['name', 'academicYear', 'termType', 'startDate', 'endDate', 'status', 'isCurrent', 'notes'];
export const calendarFields = ['title', 'description', 'startDate', 'endDate', 'eventType', 'semester', 'academicYear', 'institutionCalendarType', 'targetYearGroup', 'totalWeeks', 'hoursPerDay', 'sourceLabel', 'isActive'];
export const validAcademicYear = value => {
  const match = /^(\d{4})\/(\d{4})$/.exec(value || '');
  return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
};

export async function getAcademicState() {
  let state = await AcademicState.findById('global').lean();
  if (state) return state;
  const legacy = await AcademicTerm.find({ archived: { $ne: true }, $or: [{ isCurrent: true }, { status: 'Active' }] }).sort({ isCurrent: -1, startDate: -1 }).lean();
  if (legacy.filter(term => term.isCurrent).length > 1 || (!legacy.some(term => term.isCurrent) && legacy.length > 1)) {
    throw academicError('Multiple legacy current/active terms need reconciliation before academic settings can be changed.');
  }
  try {
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
  return { ...value, isCurrent: current, status: current ? 'Active' : completed ? 'Completed' : value.status === 'Active' ? 'Planned' : value.status };
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
  if (new Date(event.startDate) < new Date(term.startDate) || new Date(event.endDate) > new Date(term.endDate)) {
    throw academicError('The WEL window must fall within its academic term dates. Adjust the window or term before activating it.');
  }
}

export async function validateTermWindows(term) {
  const windows = await AcademicCalendar.find({ eventType: 'WEL Window', isActive: true, academicYear: term.academicYear, semester: term.termType }).lean();
  if (windows.some(window => new Date(window.startDate) < new Date(term.startDate) || new Date(window.endDate) > new Date(term.endDate))) {
    throw academicError('Term dates must include the active WEL windows. Review those windows before changing the term.');
  }
}

export function termCalendarEvents(terms) {
  return terms.flatMap(term => [
    { id: `term-start-${term._id}`, title: `${term.name} starts`, start: term.startDate, eventType: 'Semester Start', color: '#8B5CF6' },
    { id: `term-end-${term._id}`, title: `${term.name} ends`, start: term.endDate, eventType: 'Semester End', color: '#EC4899' },
  ].map(event => ({ ...event, type: 'academic', description: `${term.termType} · ${term.academicYear} · Academic Terms in Settings` })));
}
