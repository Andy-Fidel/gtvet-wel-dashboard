import test from 'node:test';
import assert from 'node:assert/strict';
import { getPartnerDeletionBlockers, PARTNER_DEPENDENCY_LABELS } from '../utils/partnerRegistry.js';

test('unused partners have no permanent-deletion blockers', () => {
  const empty = Object.fromEntries(Object.keys(PARTNER_DEPENDENCY_LABELS).map(key => [key, 0]));
  assert.deepEqual(getPartnerDeletionBlockers(empty, 0), []);
});

test('partner operational and review history is reported with user-facing labels', () => {
  const blockers = getPartnerDeletionBlockers({ placements: 3, portalAccounts: 1, vacancies: 0 }, 2);
  assert.deepEqual(blockers, [
    { key: 'placements', label: 'placements', count: 3 },
    { key: 'portalAccounts', label: 'portal accounts', count: 1 },
    { key: 'reviewHistory', label: 'partner review records', count: 2 },
  ]);
});
