import mongoose from 'mongoose';
import { Learner } from './models/Learner.js';
import { Placement } from './models/Placement.js';
import { MonitoringVisit } from './models/MonitoringVisit.js';
import { MonthlyReport } from './models/MonthlyReport.js';
import { CompetencyAssessment } from './models/CompetencyAssessment.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    try {
      const id = "65b3468de18a";
      const learner = await Learner.findOne({ _id: id });
    } catch(e) {
      console.log("Learner Error:", e.toString());
    }
    try {
      // Find a real ID
      const realLearner = await Learner.findOne();
      if(realLearner) {
          const id = realLearner._id;
          console.log("Real ID:", id);
          console.log("Fetching Placements...");
          await Placement.find({ learner: id });
          console.log("Fetching Visits...");
          await MonitoringVisit.find({ learner: id });
          console.log("Fetching Reports...");
          await MonthlyReport.find({ learner: id });
          console.log("Fetching Assessments...");
          await CompetencyAssessment.find({ learner: id });
          console.log("SUCCESS");
      }
    } catch(e) {
      console.log("Other Error:", e.toString());
    }
    process.exit(0);
  });
