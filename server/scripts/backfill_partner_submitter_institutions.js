import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';

dotenv.config();

const apply = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gtvet-wel';
await mongoose.connect(uri);

try {
  const partners = await IndustryPartner.find({ submittedByInstitution: { $exists: false } })
    .select('_id addedBy name')
    .lean();
  const userIds = [...new Set(partners.map(partner => String(partner.addedBy || '')).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } }).select('_id role institution').lean();
  const usersById = new Map(users.map(user => [String(user._id), user]));
  const institutionRoles = new Set(['Admin', 'Manager', 'Staff']);
  const operations = [];
  let institutionOwned = 0;

  for (const partner of partners) {
    const submitter = usersById.get(String(partner.addedBy || ''));
    let institution = institutionRoles.has(submitter?.role) ? String(submitter?.institution || '').trim() : '';
    if (!institution && !submitter) {
      const creation = await AuditLog.findOne({
        entityType: 'IndustryPartner',
        entityId: String(partner._id),
        action: 'CREATE',
      }).sort({ createdAt: 1 }).select('actorRole institution').lean();
      if (institutionRoles.has(creation?.actorRole)) institution = String(creation?.institution || '').trim();
    }
    if (institution) institutionOwned += 1;
    operations.push({
      updateOne: {
        filter: { _id: partner._id, submittedByInstitution: { $exists: false } },
        update: { $set: { submittedByInstitution: institution } },
      },
    });
  }

  if (apply && operations.length) await IndustryPartner.bulkWrite(operations, { ordered: false });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', scanned: partners.length, institutionOwned, systemOwned: partners.length - institutionOwned }));
} finally {
  await mongoose.disconnect();
}
