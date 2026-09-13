import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { PartnerImport } from '../models/PartnerImport.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { logAuditEvent } from './audit.js';

export const importSummary = job => ({
  importId: job._id ? String(job._id) : undefined,
  createdAt: job.createdAt,
  results: job.rows.map(({ row, name, status, message }) => ({ row, name, status, message })),
  created: job.rows.filter(row => row.status === 'Created').length,
  ready: job.rows.filter(row => row.status === 'Ready').length,
  skipped: job.rows.filter(row => row.status === 'Skipped').length,
});

export async function preparePartnerImport(rows) {
  // One lookup for the file, rather than up to 500 unindexed regex lookups.
  const existing = await IndustryPartner.find({ name: { $in: rows.map(row => row.data.name) } })
    .collation({ locale: 'en', strength: 2 }).select('name').lean();
  const names = new Set(existing.map(partner => partner.name.toLowerCase()));
  return rows.map(({ row, data, errors }) => {
    const issues = [...errors];
    if (names.has(data.name.toLowerCase())) issues.push('Company name already exists; existing partner was not changed');
    return { row, name: data.name, data, partnerId: new mongoose.Types.ObjectId(),
      status: issues.length ? 'Skipped' : 'Ready',
      message: issues.length ? issues.join('; ') : `${data.region} · ${data.totalSlots} slots` };
  });
}

export async function startPartnerImport(csv, user, rows) {
  // Reposting the same file by the same user retrieves the same saved batch.
  const id = crypto.createHash('sha256').update(`${user._id}\0${csv}`).digest('hex').slice(0, 24);
  return PartnerImport.findOneAndUpdate({ _id: id }, { $setOnInsert: { addedBy: user._id, rows } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
}

export async function advancePartnerImport(job, req) {
  const started = Date.now();
  for (const entry of job.rows.filter(row => row.status === 'Ready').slice(0, 10)) {
    if (req.timedout || Date.now() - started > 10000) break;
    // A stable partner ID closes the crash window between insertion and saving its result.
    let partner = await IndustryPartner.findById(entry.partnerId);
    let status = 'Created', message = 'Registered and approved';
    if (!partner) {
      try {
        partner = await IndustryPartner.create({ ...entry.data, _id: entry.partnerId, usedSlots: 0, linkedInstitutions: [],
          approvalStatus: 'Approved', approvalRequestedAt: new Date(), approvalReviewedAt: new Date(),
          approvalReviewedBy: job.addedBy, approvalComment: 'Bulk registered by HQ', addedBy: job.addedBy });
      } catch (error) {
        if (error.name === 'ValidationError') {
          status = 'Skipped'; message = 'Partner validation failed; correct this row and upload a revised file';
        } else {
          if (error.code !== 11000) throw error; // Transient failures stay Ready for retry.
          partner = await IndustryPartner.findById(entry.partnerId);
          if (!partner) { status = 'Skipped'; message = 'Company name already exists; existing partner was not changed'; }
        }
      }
    }
    // Conditional checkpoint is safe when two clients resume the same batch.
    const checkpoint = await PartnerImport.updateOne({ _id: job._id, rows: { $elemMatch: { row: entry.row, status: 'Ready' } } },
      { $set: { 'rows.$.status': status, 'rows.$.message': message } });
    if (partner && checkpoint.modifiedCount) {
      await logAuditEvent({ req, action: 'CREATE', entityType: 'IndustryPartner', entityId: partner._id,
        summary: `Bulk registered and approved industry partner ${partner.name}`, after: partner,
        metadata: { source: 'csv', row: entry.row, importId: String(job._id) } });
    }
  }
  return PartnerImport.findById(job._id);
}
