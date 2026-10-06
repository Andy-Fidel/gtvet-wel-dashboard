import { createHash } from 'node:crypto';
import { OfflineAction } from '../models/OfflineAction.js';

export const supportsOfflineReplay = (path, method) => (
  (method === 'POST' && /^\/(monitoring-visits|attendance-logs|support-tickets)$/.test(path))
  || (method === 'PUT' && /^\/(monitoring-visits|attendance-logs)\/[a-f\d]{24}$/i.test(path))
  || (method === 'POST' && /^\/support-tickets\/[a-f\d]{24}\/replies$/i.test(path))
);

const digest = value => createHash('sha256').update(value).digest('hex');
const uncertain = res => res.status(409).json({ code: 'OFFLINE_RESULT_UNCERTAIN', message: 'This action may already have been saved. Check the server record before submitting again. Automatic retry has been stopped.' });

export const offlineReplay = async (req, res, next) => {
  const key = req.get('X-Offline-Action');
  if (!key) return next();
  if (!supportsOfflineReplay(req.path, req.method) || !/^[a-f\d-]{36}$/i.test(key)) {
    return res.status(400).json({ message: 'Invalid offline action key or unsupported operation.' });
  }
  const id = digest(`${req.user._id}:${key}`);
  const scope = JSON.stringify([req.user.role, req.user.institution, req.user.region, String(req.user.partnerId?._id || '')]);
  const fingerprint = digest(JSON.stringify([req.method, req.originalUrl, req.body]));
  try {
    try {
      await OfflineAction.create({ _id: id, fingerprint, scope });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const receipt = await OfflineAction.findById(id);
      if (!receipt || receipt.scope !== scope || receipt.fingerprint !== fingerprint) {
        return res.status(409).json({ message: 'This action key belongs to a different request or access scope. Review the action before submitting again.' });
      }
      if (receipt.status !== 'complete') return uncertain(res);
      return res.status(receipt.responseStatus).json(receipt.responseBody);
    }

    const sendJson = res.json.bind(res);
    // Persist the receipt before delivering a response. A crash before this step
    // leaves a pending receipt that requires review, rather than repeating a write.
    res.json = body => {
      const status = res.statusCode;
      const acknowledgement = status < 400
        ? { _id: body?._id, offlineReplayed: true, message: 'This action was already saved.' }
        : { message: body?.message || 'The action was rejected.', code: body?.code };
      void OfflineAction.updateOne({ _id: id }, status >= 500
        ? { $set: { status: 'uncertain' } }
        : { $set: { status: 'complete', responseStatus: status, responseBody: acknowledgement } })
        .then(() => {
          if (status >= 500) return sendJson.call(res.status(409), { code: 'OFFLINE_RESULT_UNCERTAIN', message: 'The result could not be confirmed. Check the server record before submitting again.' });
          return sendJson(body);
        })
        .catch(error => {
          console.error('Offline action receipt could not be saved', { actionId: id, message: error.message });
          res.status(409);
          sendJson({ code: 'OFFLINE_RESULT_UNCERTAIN', message: 'The result could not be confirmed. Check the server record before submitting again.' });
        });
      return res;
    };
    return next();
  } catch (error) {
    console.error('Offline action receipt unavailable', { message: error.message });
    return res.status(503).json({ message: 'Unable to safely start this action. Please try again.' });
  }
};
