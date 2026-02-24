import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Learner } from './models/Learner.js';
import { Placement } from './models/Placement.js';
import { MonitoringVisit } from './models/MonitoringVisit.js';
import { MonthlyReport } from './models/MonthlyReport.js';

dotenv.config();

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gtvet-wel';

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB connected for seeding'))
  .catch(err => console.error('MongoDB connection error:', err));

const seedData = async () => {
  try {
    await Learner.deleteMany({});
    await Placement.deleteMany({});
    await MonitoringVisit.deleteMany({});
    await MonthlyReport.deleteMany({});

    const placements = await Placement.insertMany([
      { sector: 'Construction', location: 'Accra', supervisorName: 'John Doe', status: 'Active' },
      { sector: 'Automotive', location: 'Kumasi', supervisorName: 'Jane Smith', status: 'Active' },
      { sector: 'Hospitality', location: 'Tamale', supervisorName: 'Kwame Osei', status: 'Completed' },
      { sector: 'IT', location: 'Takoradi', supervisorName: 'Ama Mensah', status: 'Active' },
    ]);

    await Learner.insertMany([
        { name: 'Olivia Martin', gender: 'Female', institution: 'Accra Technical', program: 'Fashion Design', year: 'Year 2', region: 'Greater Accra', status: 'Placed', placement: placements[0]._id },
        { name: 'Jackson Lee', gender: 'Male', institution: 'Kumasi Technical', program: 'Automotive Engineering', year: 'Year 3', region: 'Ashanti', status: 'Pending' },
        { name: 'Isabella Nguyen', gender: 'Female', institution: 'Tamale Technical', program: 'Hospitality Management', year: 'Year 1', region: 'Northern', status: 'Placed', placement: placements[2]._id },
        { name: 'William Kim', gender: 'Male', institution: 'Ho Technical', program: 'Building Technology', year: 'Year 2', region: 'Volta', status: 'Placed', placement: placements[3]._id },
        { name: 'Sofia Davis', gender: 'Female', institution: 'Takoradi Technical', program: 'IT', year: 'Year 2', region: 'Western', status: 'Pending' },
    ]);

    const learners = await Learner.find();
    if (learners.length > 0) {
        await MonitoringVisit.insertMany([
            { visitDate: new Date(), visitorPosition: 'Liaison Officer', visitType: 'Routine', attendanceStatus: 'Present', performanceRating: 4, keyObservations: 'Good progress', issuesIdentified: 'None', actionRequired: 'None', learner: learners[0]._id },
            { visitDate: new Date(Date.now() - 86400000 * 7), visitorPosition: 'Supervisor', visitType: 'Follow-up', attendanceStatus: 'Present', performanceRating: 3, keyObservations: 'Improving', issuesIdentified: 'Punctuality', actionRequired: 'Talk to student', learner: learners[2]._id },
        ]);

        await MonthlyReport.insertMany([
             { weekEnding: new Date(), taskCompleted: 'Engine overhaul assistance', skillsPracticed: 'Wrenching', challengesFaced: 'Heavy lifting', supervisorComments: 'Good worker', hoursWorked: 40, reportStatus: 'Approved', learner: learners[3]._id },
             { weekEnding: new Date(Date.now() - 86400000 * 7), taskCompleted: 'Front desk management', skillsPracticed: 'Communication', challengesFaced: 'Rude customers', supervisorComments: ' handled well', hoursWorked: 38, reportStatus: 'Submitted', learner: learners[2]._id }
        ]);
    }

    console.log('Database seeded successfully');
    process.exit();
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedData();
