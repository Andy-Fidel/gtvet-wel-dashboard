import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTNER_SECTORS, isPartnerSector } from '../utils/partnerTaxonomy.js';

test('partner registration sectors use the approved controlled list', () => {
  assert.equal(PARTNER_SECTORS.length, 22);
  assert.equal(new Set(PARTNER_SECTORS).size, PARTNER_SECTORS.length);
  assert.equal(isPartnerSector('Automotive'), true);
  assert.equal(isPartnerSector('Health/Medical Services'), true);
  assert.equal(isPartnerSector('Information Technology'), false);
  assert.equal(isPartnerSector(''), false);
});
