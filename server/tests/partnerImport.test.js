import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePartnerCsv } from '../utils/partnerImport.js';

test('parses Excel BOM, quoted commas, escaped quotes and multiline fields', () => {
  const [row] = parsePartnerCsv('\uFEFFname,sector,region,contactPhone,location\r\n"Acme, ""Ghana""",Engineering,greater accra,0241234567,"First floor\nAccra"');
  assert.deepEqual(row.errors, []);
  assert.equal(row.data.name, 'Acme, "Ghana"');
  assert.equal(row.data.region, 'Greater Accra');
  assert.equal(row.data.contactPhone, '0241234567');
  assert.equal(row.data.totalSlots, 0);
});
test('reports invalid fields and duplicates without discarding valid rows', () => {
  const rows = parsePartnerCsv('name,sector,region,totalSlots,contactEmail,website\nAcme,IT,Ashanti,5,a@b.com,https://example.com\nACME,IT,Unknown,-1,bad,javascript:alert(1)');
  assert.equal(rows[0].errors.length, 0);
  assert.equal(rows[1].errors.length, 5);
});
test('rejects malformed structure and excessive batch sizes', () => {
  for (const csv of ['', 'name,name,region\na,b,c', 'name,sector\na,b', 'name,sector,region\n"unclosed', 'name,sector,region,addedBy\na,b,c,d']) {
    assert.throws(() => parsePartnerCsv(csv));
  }
  assert.throws(() => parsePartnerCsv('name,sector,region\n' + 'Acme,IT,Ashanti\n'.repeat(501)));
  assert.throws(() => parsePartnerCsv('x'.repeat(1024 * 1024 + 1)));
});
test('retains source row numbers and validates column count and fractional capacity', () => {
  const rows = parsePartnerCsv('name,sector,region,totalSlots\n\nAcme,IT,Ashanti,1.5\nOther,IT,Ashanti,2,extra');
  assert.equal(rows[0].row, 3);
  assert.match(rows[0].errors.join(), /whole number/);
  assert.match(rows[1].errors.join(), /Column count/);
});
