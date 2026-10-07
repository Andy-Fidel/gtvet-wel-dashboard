import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { healthProbes, runDiagnostics, systemHealthHandler } from '../utils/systemHealth.js';
import { Notification } from '../models/Notification.js';
import { NotificationSchedule } from '../models/NotificationSchedule.js';

const uri = process.env.GTVET_HEALTH_TEST_URI;
test('real MongoDB reads verify data access, queue counts and worker freshness', { skip: !uri }, async () => {
  const target = new URL(uri);
  assert.equal(target.hostname, '127.0.0.1');
  assert.equal(target.pathname, '/gtvet_system_health_test');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
  try {
    await mongoose.connection.db.dropDatabase();
    const recipient = new mongoose.Types.ObjectId();
    await Notification.create([
      { recipient, title: 'Test', message: 'Test', pushStatus: 'pending', pushAttempts: 0 },
      { recipient, title: 'Test', message: 'Test', pushStatus: 'failed', pushAttempts: 5 },
      { recipient, title: 'Test', message: 'Test', whatsAppStatus: 'failed', whatsAppAttempts: 1 },
    ]);
    await NotificationSchedule.create({ key: 'delivery-worker-health', nextRunAt: new Date(0), lastCompletedAt: new Date() });
    const result = await runDiagnostics(healthProbes.filter(probe => ['database', 'mongoose', 'queue', 'prisma'].includes(probe.id)));
    assert.equal(result.checks.find(check => check.id === 'database').status, 'healthy');
    assert.equal(result.checks.find(check => check.id === 'mongoose').status, 'healthy');
    const queue = result.checks.find(check => check.id === 'queue');
    assert.equal(queue.status, 'warning');
    assert.equal(queue.details.find(item => item.label === 'Waiting / retrying').value, '2');
    assert.equal(queue.details.find(item => item.label === 'Retries exhausted').value, '1');
    await Notification.deleteMany({});
    const queueProbe = healthProbes.find(probe => probe.id === 'queue');
    assert.equal((await queueProbe.probe()).status, 'healthy');
    await NotificationSchedule.updateOne({ key: 'delivery-worker-health' }, { $set: { lastCompletedAt: new Date(Date.now() - 10 * 60000) } });
    assert.equal((await queueProbe.probe()).status, 'warning');
    // Exercise the actual HTTP response against the isolated database. Session
    // identity is supplied by the test; the production route still uses auth.
    const app = express();
    app.use((req, _res, next) => { req.user = { role: req.get('x-test-role') }; next(); });
    app.get('/api/system-health', requireRole('SuperAdmin', 'HQManager', 'HQStaff'), systemHealthHandler);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}/api/system-health`;
      assert.equal((await fetch(url, { headers: { 'x-test-role': 'Admin' } })).status, 403);
      const response = await fetch(url, { headers: { 'x-test-role': 'HQStaff' } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = await response.json();
      assert.equal(body.checks.find(check => check.id === 'database').status, 'healthy');
      assert.equal(body.checks.find(check => check.id === 'prisma').status, 'not_used');
      assert.ok(Number.isFinite(Date.parse(body.checkedAt)));
      assert.equal(body.checks.length, 10);
    } finally { await new Promise(resolve => server.close(resolve)); }
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }
});
