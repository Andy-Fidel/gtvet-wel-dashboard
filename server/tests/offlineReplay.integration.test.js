import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { offlineReplay } from '../utils/offlineReplay.js';
import { OfflineAction } from '../models/OfflineAction.js';

test('Mongo receipts survive lost responses, concurrent requests and failed operations', { skip: process.env.OFFLINE_MONGO_INTEGRATION !== '1' }, async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27032/wel_offline_qa_${Date.now()}`, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  let server;
  try {
    let writes = 0;
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { _id: 'actor', role: 'Staff', institution: 'QA' }; next(); });
    app.use(offlineReplay);
    app.post('/monitoring-visits', async (req, res) => {
      writes++;
      await new Promise(resolve => setTimeout(resolve, 30));
      if (req.body.fail) return res.status(500).json({ message: 'Failure after write' });
      return res.status(201).json({ _id: 'one-record', privateNotes: 'Do not store in replay receipt' });
    });
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const url = `http://127.0.0.1:${server.address().port}/monitoring-visits`;
    const key = randomUUID();
    const send = (actionKey = key, body = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Offline-Action': actionKey }, body: JSON.stringify(body) });
    const responses = await Promise.all(Array.from({ length: 5 }, () => send()));
    assert.equal(writes, 1, 'Exactly one handler executes under concurrent requests');
    assert.ok(responses.some(response => response.status === 201));
    assert.ok(responses.every(response => [201, 409].includes(response.status)));
    for (const response of responses) await response.text();
    const replay = await send();
    assert.equal(replay.status, 201);
    assert.equal((await replay.json()).offlineReplayed, true);
    assert.equal(writes, 1, 'Lost-response retry reuses receipt');
    assert.equal((await send(key, { changed: true })).status, 409);
    const failingKey = randomUUID();
    assert.equal((await send(failingKey, { fail: true })).status, 409);
    assert.equal((await send(failingKey, { fail: true })).status, 409);
    assert.equal(writes, 2, 'A partially failed operation is never repeated');
    assert.equal(await OfflineAction.countDocuments(), 2);
    assert.equal((await OfflineAction.findOne({ status: 'complete' })).responseBody.privateNotes, undefined);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
