import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { CompetencyAssessment } from '../models/CompetencyAssessment.js';
import { Placement } from '../models/Placement.js';

dotenv.config();

if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI explicitly for the target database');
const apply = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });

const summary = { mode: apply ? 'apply' : 'dry-run', scanned: 0, matched: 0, ambiguous: 0, unmatched: 0, updated: 0 };
try {
  const assessments = CompetencyAssessment.find({ partner: null, placement: null })
    .select('_id learner institution assessmentDate')
    .lean()
    .cursor();

  for await (const assessment of assessments) {
    summary.scanned += 1;
    const date = new Date(assessment.assessmentDate);
    if (!Number.isFinite(date.getTime())) {
      summary.unmatched += 1;
      continue;
    }
    const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const placements = await Placement.find({
      learner: assessment.learner,
      institution: assessment.institution,
      partner: { $ne: null },
      startDate: { $lt: nextDay },
      endDate: { $gte: dayStart },
    }).select('_id partner').lean();

    if (placements.length !== 1) {
      summary[placements.length > 1 ? 'ambiguous' : 'unmatched'] += 1;
      continue;
    }
    summary.matched += 1;
    if (apply) {
      const result = await CompetencyAssessment.updateOne(
        { _id: assessment._id, partner: null, placement: null },
        { $set: { partner: placements[0].partner, placement: placements[0]._id } },
      );
      summary.updated += result.modifiedCount;
    }
  }
  console.log(JSON.stringify(summary));
} finally {
  await mongoose.disconnect();
}
