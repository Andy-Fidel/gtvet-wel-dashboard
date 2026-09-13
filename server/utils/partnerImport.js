import { normalizeCoordinates } from './workplaceCoordinates.js';
export const PARTNER_COLUMNS = ['name', 'sector', 'region', 'totalSlots', 'district', 'tradeArea', 'town', 'location', 'contactPerson', 'contactPhone', 'contactEmail', 'website', 'status', 'latitude', 'longitude'];
const regions = ['Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern', 'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah', 'Upper East', 'Upper West', 'Volta', 'Western', 'Western North'];

export function parsePartnerCsv(csv) {
  if (typeof csv !== 'string' || !csv.trim()) throw new Error('Select a non-empty CSV file.');
  if (Buffer.byteLength(csv, 'utf8') > 1024 * 1024) throw new Error('CSV files must be 1 MB or smaller.');
  const records = [];
  let row = [], field = '', quoted = false, closed = false;
  const endField = () => { row.push(field.trim()); field = ''; closed = false; };
  const endRow = () => { endField(); records.push(row); row = []; };
  csv = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ',') endField();
    else if (char === '\n' || char === '\r') { endRow(); if (char === '\r' && csv[i + 1] === '\n') i++; }
    else if (char === '"' && !field && !closed) quoted = true;
    else if (char === '"' || (closed && char.trim())) throw new Error('Malformed CSV quoting. Export the file as CSV and try again.');
    else if (!closed) field += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (field || row.length || closed) endRow();
  const headers = records.shift()?.map(value => value.toLowerCase());
  if (!headers || new Set(headers).size !== headers.length) throw new Error('CSV headers must be unique.');
  for (const required of ['name', 'sector', 'region']) if (!headers.includes(required)) throw new Error(`Missing required column: ${required}. Use the template.`);
  if (headers.some(header => !PARTNER_COLUMNS.some(column => column.toLowerCase() === header))) throw new Error('Unknown CSV column. Use the template column names.');
  const rows = records.map((values, index) => ({ values, row: index + 2 })).filter(({ values }) => values.some(Boolean));
  if (!rows.length || rows.length > 500) throw new Error('Upload between 1 and 500 partners at a time.');
  const seen = new Set();
  return rows.map(({ values, row }) => {
    const data = Object.fromEntries(PARTNER_COLUMNS.map(column => [column, values[headers.indexOf(column.toLowerCase())] || '']));
    const errors = [];
    if (values.length !== headers.length) errors.push('Column count does not match the header');
    for (const key of ['name', 'sector']) if (data[key].length < 2) errors.push(`${key} must contain at least 2 characters`);
    if (Object.values(data).some(value => value.length > 500)) errors.push('Fields must be 500 characters or shorter');
    const region = regions.find(value => value.toLowerCase() === data.region.toLowerCase());
    if (!region) errors.push('Select a valid Ghana region');
    else data.region = region;
    if (data.totalSlots && !/^\d+$/.test(data.totalSlots)) errors.push('totalSlots must be a non-negative whole number');
    data.totalSlots = Number(data.totalSlots || 0);
    if (!Number.isSafeInteger(data.totalSlots)) errors.push('Invalid capacity');
    data.status = data.status || 'Active';
    if (!['Active', 'Inactive'].includes(data.status)) errors.push('status must be Active or Inactive');
    if (data.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) errors.push('Invalid contact email');
    data.contactEmail = data.contactEmail.toLowerCase();
    if (data.website) {
      try { if (!['http:', 'https:'].includes(new URL(data.website).protocol)) throw new Error(); }
      catch { errors.push('website must be a valid http or https URL'); }
    }
    const key = data.name.toLowerCase();
    try { data.coordinates = normalizeCoordinates({ lat: data.latitude, lng: data.longitude }); }
    catch (error) { errors.push(error.message); }
    delete data.latitude;
    delete data.longitude;
    if (seen.has(key)) errors.push('Duplicate company name in this file');
    if (!errors.length) seen.add(key);
    return { row, data, errors };
  });
}
