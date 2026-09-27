import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditLog } from '../models/AuditLog.js';
import { logAuditEvent } from '../utils/audit.js';

test('audit events may use an explicit operational scope while retaining the real actor', async t => {
  let created;
  t.mock.method(AuditLog, 'create', async document => { created = document; return document; });

  await logAuditEvent({
    req: {
      user: { _id: 'actor-id', name: 'Origin Manager', role: 'Manager', institution: 'Origin Institute' },
      originalUrl: '/api/placements/placement/delegate',
      method: 'PUT',
      headers: {},
    },
    action: 'CREATE',
    entityType: 'CrossRegionDelegation',
    entityId: 'placement',
    summary: 'Created regional delegation record',
    scope: { institution: 'Receiving Institute', region: 'Greater Accra' },
  });

  assert.equal(created.actorName, 'Origin Manager');
  assert.equal(created.actorRole, 'Manager');
  assert.equal(created.institution, 'Receiving Institute');
  assert.equal(created.region, 'Greater Accra');
});
