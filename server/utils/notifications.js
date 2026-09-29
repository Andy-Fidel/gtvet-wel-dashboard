import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { sendWhatsAppMessage, canSendWhatsApp } from './whatsapp.js';
import { isWebPushConfigured, sendWebPushToUser } from './webPush.js';

const preferenceByType = {
  system: 'systemUpdates', placement: 'placementUpdates', visit: 'visitUpdates',
  assessment: 'assessmentUpdates', report: 'reportReminders', partner: 'partnerUpdates',
  support: 'supportUpdates',
};
const channels = ['push', 'whatsApp'];
const maxAttempts = 5;
const retryDelay = (attempt) => Math.min(60 * 60 * 1000, 30 * 1000 * 2 ** (attempt - 1));

async function deliverChannel(notification, channel) {
  const status = `${channel}Status`;
  const attempts = `${channel}Attempts`;
  const nextAttempt = `${channel}NextAttemptAt`;
  const lockedUntil = `${channel}LockedUntil`;
  const sentAt = `${channel}SentAt`;
  const errorField = `${channel}Error`;
  const now = new Date();
  const claimed = await Notification.findOneAndUpdate({
    _id: notification._id,
    [status]: { $in: ['pending', 'failed'] },
    $and: [
      { $or: [{ [attempts]: { $exists: false } }, { [attempts]: { $lt: maxAttempts } }] },
      { $or: [{ [nextAttempt]: { $exists: false } }, { [nextAttempt]: { $lte: now } }] },
      { $or: [{ [lockedUntil]: { $exists: false } }, { [lockedUntil]: { $lte: now } }] },
    ],
  }, { $set: { [lockedUntil]: new Date(now.getTime() + 30000) }, $inc: { [attempts]: 1 } }, { returnDocument: 'after' });
  if (!claimed) return null;

  let outcome = { ok: false, skipped: false, error: 'Delivery failed' };
  try {
    const user = await User.findOne({ _id: claimed.recipient, status: 'Active' }).select('phone notificationPreferences');
    const category = preferenceByType[claimed.type] || 'systemUpdates';
    if (!user || user.notificationPreferences?.[category] === false) {
      outcome = { ok: false, skipped: true, error: 'Recipient or notification category is no longer active' };
    } else if (channel === 'push') {
      if (user.notificationPreferences?.push === false || !isWebPushConfigured()) {
        outcome = { ok: false, skipped: true, error: 'Push is disabled' };
      } else {
        const result = await sendWebPushToUser(claimed.recipient, claimed);
        outcome = { ok: result.sent > 0, skipped: result.skipped, error: result.error || '' };
      }
    } else if (!user.notificationPreferences?.whatsApp || !user.phone?.trim() || !canSendWhatsApp()) {
      outcome = { ok: false, skipped: true, error: 'WhatsApp is disabled' };
    } else {
      const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
      const link = claimed.link && claimed.link.startsWith('/') ? `${frontendBase}${claimed.link}` : '';
      const result = await sendWhatsAppMessage({
        to: user.phone,
        body: `${claimed.title}\n\n${claimed.message}${link ? `\n\nOpen: ${link}` : ''}`,
      });
      outcome = { ok: result.ok, skipped: result.skipped, error: result.error || '' };
    }
  } catch (error) {
    outcome = { ok: false, skipped: false, error: error instanceof Error ? error.message : 'Delivery failed' };
  }

  const update = {
    [status]: outcome.ok ? 'sent' : outcome.skipped ? 'skipped' : 'failed',
    [errorField]: outcome.error,
    [lockedUntil]: null,
    [nextAttempt]: outcome.ok || outcome.skipped || claimed[attempts] >= maxAttempts
      ? null : new Date(Date.now() + retryDelay(claimed[attempts])),
  };
  if (outcome.ok) update[sentAt] = new Date();
  await Notification.updateOne({ _id: claimed._id }, { $set: update });
  if (!outcome.ok && !outcome.skipped) {
    console.error(`Notification ${channel} delivery failed`, { notificationId: String(claimed._id), attempts: claimed[attempts], error: outcome.error });
  }
  return outcome;
}

export async function processPendingNotificationDeliveries(limit = 50) {
  const now = new Date();
  for (const channel of channels) {
    const status = `${channel}Status`;
    const attempts = `${channel}Attempts`;
    const nextAttempt = `${channel}NextAttemptAt`;
    const pending = await Notification.find({
      [status]: { $in: ['pending', 'failed'] },
      $and: [
        { $or: [{ [attempts]: { $exists: false } }, { [attempts]: { $lt: maxAttempts } }] },
        { $or: [{ [nextAttempt]: { $exists: false } }, { [nextAttempt]: { $lte: now } }] },
      ],
    }).select('_id').sort({ [nextAttempt]: 1 }).limit(limit).lean();
    for (const notification of pending) await deliverChannel(notification, channel);
  }
}

async function dispatchNotifications({
  recipientIds = [], roles = [], region = null, institution = null, partnerId = null,
  sender = null, type = 'system', title, message, link = null, dedupeKey = null,
}) {
  const targetIds = new Set(recipientIds.filter(Boolean).map(String));
  if (roles.length > 0 || region || institution || partnerId) {
    const query = { status: 'Active' };
    if (roles.length > 0) query.role = { $in: roles };
    if (region) query.region = region;
    if (institution) query.institution = institution;
    if (partnerId) query.partnerId = partnerId;
    const users = await User.find(query).select('_id');
    users.forEach((user) => targetIds.add(String(user._id)));
  }
  if (sender) targetIds.delete(String(sender));
  if (!targetIds.size) return { created: 0, pushSent: 0, pushFailed: 0 };

  const category = preferenceByType[type] || 'systemUpdates';
  const recipients = await User.find({
    _id: { $in: [...targetIds] }, status: 'Active',
    [`notificationPreferences.${category}`]: { $ne: false },
  }).select('_id phone notificationPreferences');
  const created = [];
  for (const user of recipients) {
    const deliveryChannels = [];
    if (user.notificationPreferences?.inApp !== false) deliveryChannels.push('inApp');
    if (user.notificationPreferences?.whatsApp === true && user.phone?.trim() && canSendWhatsApp()) deliveryChannels.push('whatsApp');
    if (user.notificationPreferences?.push !== false && isWebPushConfigured()) deliveryChannels.push('push');
    if (!deliveryChannels.length) continue;
    const identity = dedupeKey ? `${String(user._id)}:${dedupeKey}` : undefined;
    if (identity && await Notification.exists({ recipient: user._id, dedupeKey })) continue;
    try {
      created.push(await Notification.create({
        recipient: user._id, sender, type, title, message, link, dedupeKey,
        ...(identity ? { dedupeIdentity: identity } : {}),
        visibleInApp: deliveryChannels.includes('inApp'), deliveryChannels,
        ...(deliveryChannels.includes('push') ? { pushStatus: 'pending', pushNextAttemptAt: new Date() } : {}),
        ...(deliveryChannels.includes('whatsApp') ? { whatsAppStatus: 'pending', whatsAppNextAttemptAt: new Date() } : {}),
      }));
    } catch (error) {
      if (identity && error?.code === 11000) continue;
      throw error;
    }
  }

  const deliveries = await Promise.all(created.flatMap((notification) => channels
    .filter((channel) => notification.deliveryChannels.includes(channel))
    .map(async (channel) => ({ channel, result: await deliverChannel(notification, channel) }))));
  return {
    created: created.length,
    pushSent: deliveries.filter(({ channel, result }) => channel === 'push' && result?.ok).length,
    pushFailed: deliveries.filter(({ channel, result }) => channel === 'push' && result && !result.ok).length,
  };
}

export async function notifyUsers(options) {
  try {
    return await dispatchNotifications(options);
  } catch (error) {
    console.error('Notification dispatch failed:', error);
    return { created: 0, pushSent: 0, pushFailed: 0, error: 'Notification dispatch failed' };
  }
}
