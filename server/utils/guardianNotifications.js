import { User } from '../models/User.js';
import { Learner } from '../models/Learner.js';
import { notifyUsers } from './notifications.js';

const titles = {
  placement: 'Your ward has been placed',
  visit: 'Monitoring update for your ward',
  assessment: 'Your ward has been assessed',
};

const dateLabel = value => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GH', { dateStyle: 'long', timeZone: 'Africa/Accra' }).format(date)
    : null;
};

// Only saved records are passed here. Linked accounts, not contact phone numbers,
// determine access; delivery channels and preferences remain in notifyUsers.
export async function notifyGuardianUpdates({ type, records = [], sender = null }) {
  if (!records.length) return;
  try {
    if (!titles[type]) throw new Error('Unsupported guardian notification type');
    const learnerIds = [...new Set(records.map(record => String(record.learner)))];
    const guardians = await User.find({ role: 'Guardian', status: 'Active', linkedLearners: { $in: learnerIds } }).select('_id linkedLearners');
    if (!guardians.length) return;
    const learners = await Learner.find({ _id: { $in: learnerIds } }).select('firstName middleName lastName trackingId institution').lean();
    const byId = new Map(learners.map(learner => [String(learner._id), learner]));
    for (const record of records) {
      const learner = byId.get(String(record.learner));
      if (!learner || learner.institution !== record.institution) continue;
      const recipientIds = guardians.filter(guardian => guardian.linkedLearners.some(id => String(id) === String(record.learner))).map(guardian => guardian._id);
      if (!recipientIds.length) continue;
      const name = [learner.lastName, learner.middleName, learner.firstName].filter(Boolean).join(' ') || learner.trackingId || 'Your ward';
      let message;
      if (type === 'placement') {
        const start = dateLabel(record.startDate);
        message = `${name} has been placed with ${record.companyName || 'a workplace'}${start ? `, starting ${start}` : ''}. Open your family overview to review the placement and any required consent.`;
      } else if (type === 'visit') {
        const visited = dateLabel(record.visitDate);
        message = `A monitoring visit has been logged for ${name}${visited ? ` on ${visited}` : ''}. Open your family overview for the latest monitoring update.`;
      } else {
        const assessed = dateLabel(record.assessmentDate);
        message = `A competency assessment has been recorded for ${name}${assessed ? ` on ${assessed}` : ''}. Open your family overview to view the latest assessment summary.`;
      }
      await notifyUsers({ recipientIds, sender, type, title: titles[type], message,
        link: '/guardian-dashboard', dedupeKey: `guardian:${type}:${record._id}` });
    }
  } catch (error) {
    // A delivery failure must not make an already-saved milestone appear to fail.
    console.error('Guardian notification dispatch failed:', error);
  }
}
