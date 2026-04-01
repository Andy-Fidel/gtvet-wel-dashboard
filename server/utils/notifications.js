import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';

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
  link = null
}) {
  try {
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

    // Build models
    const notifications = targetUserIds.map(userId => ({
      recipient: userId,
      sender,
      type,
      title,
      message,
      link
    }));

    await Notification.insertMany(notifications);
  } catch (error) {
    console.error('Error dispatching notifications:', error);
  }
}
