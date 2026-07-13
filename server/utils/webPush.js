import webpush from 'web-push';
import { PushSubscription } from '../models/PushSubscription.js';

let configuredKeyPair = '';

const getConfiguration = () => ({
  publicKey: process.env.VAPID_PUBLIC_KEY?.trim(),
  privateKey: process.env.VAPID_PRIVATE_KEY?.trim(),
  subject: process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com',
});

const configureWebPush = () => {
  const configuration = getConfiguration();
  if (!configuration.publicKey || !configuration.privateKey) return null;

  const keyPair = `${configuration.publicKey}:${configuration.privateKey}:${configuration.subject}`;
  if (configuredKeyPair !== keyPair) {
    webpush.setVapidDetails(configuration.subject, configuration.publicKey, configuration.privateKey);
    configuredKeyPair = keyPair;
  }
  return configuration;
};

export const isWebPushConfigured = () => Boolean(configureWebPush());
export const getVapidPublicKey = () => configureWebPush()?.publicKey || null;

export async function sendWebPushToUser(userId, notification) {
  if (!configureWebPush()) {
    return { sent: 0, failed: 0, skipped: true, error: 'Web Push is not configured' };
  }

  const subscriptions = await PushSubscription.find({ user: userId });
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, skipped: true, error: '' };
  }

  const payload = JSON.stringify({
    id: notification._id.toString(),
    title: notification.title,
    body: notification.message,
    url: notification.link || '/notifications',
    type: notification.type,
    createdAt: notification.createdAt,
  });

  const results = await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: subscription.keys,
      }, payload, { TTL: 60 * 60 * 24, urgency: 'normal' });
      await PushSubscription.updateOne(
        { _id: subscription._id },
        { $set: { lastUsedAt: new Date() } }
      );
      return { ok: true };
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id });
      }
      return { ok: false, error: error instanceof Error ? error.message : 'Push delivery failed' };
    }
  }));

  const sent = results.filter((result) => result.ok).length;
  const failures = results.filter((result) => !result.ok);
  return {
    sent,
    failed: failures.length,
    skipped: false,
    error: failures[0]?.error || '',
  };
}
