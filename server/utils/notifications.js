import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { sendWhatsAppMessage } from './whatsapp.js';

const notificationPreferenceKeyByType = {
  system: 'systemUpdates',
  placement: 'placementUpdates',
  visit: 'visitUpdates',
  assessment: 'assessmentUpdates',
  report: 'reportReminders',
  partner: 'partnerUpdates',
  support: 'supportUpdates',
};

/**
 * Robust notification dispatcher.
 * Intelligently resolves recipients based on explicit IDs, roles, regions, institutions, or partner associations.
 * Creates deduplicated notifications in the database.
 */
export async function notifyUsers({
  recipientIds = [],
  roles = [],
  region = null,
  institution = null,
  partnerId = null,
  sender = null,
  type = 'system',
  title,
  message,
  link = null,
  dedupeKey = null,
}) {
  try {
    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    let targetUserIds = [...recipientIds];

    // Build dynamic query if targeting loosely
    if (roles.length > 0 || region || institution || partnerId) {
      const query = {};
      if (roles.length > 0) query.role = { $in: roles };
      if (region) query.region = region;
      if (institution) query.institution = institution;
      if (partnerId) query.partnerId = partnerId;

      const users = await User.find(query).select('_id');
      targetUserIds = [...targetUserIds, ...users.map(u => u._id.toString())];
    }

    // Deduplicate
    targetUserIds = [...new Set(targetUserIds.map(id => id.toString()))];

    // Filter out sender from receiving their own notification
    if (sender) {
      targetUserIds = targetUserIds.filter(id => id !== sender.toString());
    }

    if (targetUserIds.length === 0) return;

    const preferenceKey = notificationPreferenceKeyByType[type] || 'systemUpdates';
    const eligibleRecipients = await User.find({
      _id: { $in: targetUserIds },
      [`notificationPreferences.${preferenceKey}`]: { $ne: false },
    }).select('_id name phone notificationPreferences');

    if (eligibleRecipients.length === 0) return;

    const recipientChannelMap = new Map();
    eligibleRecipients.forEach((user) => {
      const channels = [];
      if (user.notificationPreferences?.inApp !== false) channels.push('inApp');
      if (user.notificationPreferences?.whatsApp === true && user.phone?.trim()) channels.push('whatsApp');
      if (channels.length > 0) {
        recipientChannelMap.set(user._id.toString(), {
          user,
          channels,
        });
      }
    });

    targetUserIds = Array.from(recipientChannelMap.keys());

    if (targetUserIds.length === 0) return;

    if (dedupeKey) {
      const existingNotifications = await Notification.find({
        recipient: { $in: targetUserIds },
        dedupeKey,
      }).select('recipient');

      const existingRecipients = new Set(existingNotifications.map((notification) => notification.recipient.toString()));
      targetUserIds = targetUserIds.filter((userId) => !existingRecipients.has(userId));
    }

    if (targetUserIds.length === 0) return;

    const notifications = targetUserIds.map((userId) => {
      const channelInfo = recipientChannelMap.get(userId);
      const channels = channelInfo?.channels || [];
      return {
        recipient: userId,
        sender,
        type,
        title,
        message,
        link,
        dedupeKey,
        visibleInApp: channels.includes('inApp'),
        deliveryChannels: channels,
        whatsAppStatus: channels.includes('whatsApp') ? 'pending' : undefined,
      };
    });

    const insertedNotifications = await Notification.insertMany(notifications);

    await Promise.all(insertedNotifications.map(async (notification) => {
      if (!notification.deliveryChannels?.includes('whatsApp')) return;

      const channelInfo = recipientChannelMap.get(notification.recipient.toString());
      const user = channelInfo?.user;
      if (!user?.phone) return;

      const delivery = await sendWhatsAppMessage({
        to: user.phone,
        body: `${title}\n\n${message}${link ? `\n\nOpen: ${link.startsWith('http') ? link : `${frontendBase}${link}`}` : ''}`,
      }).catch((error) => ({
        ok: false,
        skipped: false,
        error: error instanceof Error ? error.message : 'WhatsApp send failed',
      }));

      if (delivery.ok) {
        await Notification.updateOne(
          { _id: notification._id },
          {
            $set: {
              whatsAppStatus: 'sent',
              whatsAppSentAt: new Date(),
              whatsAppError: '',
            },
          }
        );
      } else {
        await Notification.updateOne(
          { _id: notification._id },
          {
            $set: {
              whatsAppStatus: 'failed',
              whatsAppError: delivery.error || 'WhatsApp send failed',
            },
          }
        );
      }
    }));
  } catch (error) {
    console.error('Error dispatching notifications:', error);
  }
}
