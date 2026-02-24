import express from 'express';
import { Learner } from '../models/Learner.js';
import { Placement } from '../models/Placement.js';
import { MonitoringVisit } from '../models/MonitoringVisit.js';
import { MonthlyReport } from '../models/MonthlyReport.js';
import { User } from '../models/User.js';
import { Institution } from '../models/Institution.js';
import { CompetencyAssessment } from '../models/CompetencyAssessment.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All routes below require authentication
router.use(auth);

// Helper: get institution filter (SuperAdmin sees all)
const getFilter = (user) => {
  if (user.role === 'SuperAdmin') return {};
  return { institution: user.institution };
};

// ==================== MONITORING VISITS ====================

router.get('/monitoring-visits', async (req, res) => {
    try {
      const filter = getFilter(req.user);
      const visits = await MonitoringVisit.find(filter)
        .populate({
            path: 'learner',
            populate: { path: 'placement' }
        });
      res.json(visits);
    } catch (error) {
      res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/monitoring-visits', async (req, res) => {
    try {
        const newVisit = new MonitoringVisit({
          ...req.body,
          institution: req.user.institution,
        });
        await newVisit.save();
        res.status(201).json(newVisit);
    } catch (error) {
        res.status(500).json({ message: 'Error creating visit' });
    }
});

router.put('/monitoring-visits/:id', async (req, res) => {
    try {
        const updatedVisit = await MonitoringVisit.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedVisit);
    } catch (error) {
        res.status(500).json({ message: 'Error updating visit' });
    }
});

router.delete('/monitoring-visits/:id', async (req, res) => {
    try {
        await MonitoringVisit.findByIdAndDelete(req.params.id);
        res.json({ message: 'Visit deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting visit' });
    }
});

// ==================== DASHBOARD STATS ====================

router.get('/dashboard/stats', async (req, res) => {
  try {
    const filter = getFilter(req.user);

    const totalLearners = await Learner.countDocuments(filter);
    const placedLearners = await Learner.countDocuments({ ...filter, status: 'Placed' });
    const pendingLearners = await Learner.countDocuments({ ...filter, status: 'Pending' });
    
    const recentPlacements = await Learner.find({ ...filter, status: 'Placed' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate('placement');

    const monthlyStats = [
      { name: "Jan", total: 120 },
      { name: "Feb", total: 145 },
      { name: "Mar", total: 180 },
      { name: "Apr", total: 220 },
      { name: "May", total: 280 },
      { name: "Jun", total: 350 },
    ];

    res.json({
      totalLearners,
      placed: placedLearners,
      pending: pendingLearners,
      recentPlacements,
      monthlyStats
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error });
  }
});

router.get('/dashboard/action-alerts', async (req, res) => {
    try {
        const filter = getFilter(req.user);
        const alerts = [];

        // 1. Pending Learners (Needs Placement)
        const pendingLearners = await Learner.find({ ...filter, status: 'Pending' }).select('name trackingId');
        pendingLearners.forEach(l => {
            alerts.push({
                type: 'Needs Placement',
                learnerId: l._id,
                learnerName: l.name,
                trackingId: l.trackingId,
                message: 'Learner is registered but not placed in industry.',
                actionUrl: `/placements?learnerId=${l._id}`
            });
        });

        // 2. Placed Learners with no visits in last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Find all Placed learners
        const placedLearners = await Learner.find({ ...filter, status: 'Placed' });
        
        for (const l of placedLearners) {
            // Did they have a visit recently?
            const recentVisit = await MonitoringVisit.findOne({ learner: l._id, visitDate: { $gte: thirtyDaysAgo } });
            if (!recentVisit) {
                alerts.push({
                    type: 'Needs Visit',
                    learnerId: l._id,
                    learnerName: l.name,
                    trackingId: l.trackingId,
                    message: 'No monitoring visit logged in the last 30 days.',
                    actionUrl: `/monitoring-visits?learnerId=${l._id}`
                });
            }

            // 3. Placed Learners close to completion (endDate < 14 days) without Competency Assessment
            // Find active placement
            const activePlacement = await Placement.findOne({ learner: l._id, status: 'Active' }).sort({ startDate: -1 });
            if (activePlacement) {
                const fourteenDaysFromNow = new Date();
                fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);
                
                if (new Date(activePlacement.endDate) <= fourteenDaysFromNow) {
                    // Check if they have an assessment
                    const assessment = await CompetencyAssessment.findOne({ learner: l._id });
                    if (!assessment) {
                         alerts.push({
                            type: 'Needs Assessment',
                            learnerId: l._id,
                            learnerName: l.name,
                            trackingId: l.trackingId,
                            message: 'Placement ending soon. Final assessment required.',
                            actionUrl: `/competency-assessments?learnerId=${l._id}`
                        });
                    }
                }
            }
        }

        res.json(alerts);
    } catch (error) {
        console.error("Error fetching action alerts:", error);
        res.status(500).json({ message: 'Server Error', error });
    }
});

// ==================== GLOBAL SEARCH ====================

router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.json({ learners: [], placements: [], institutions: [] });
        }

        const filter = getFilter(req.user);
        const searchRegex = new RegExp(q, 'i');

        // Search Learners
        const learners = await Learner.find({
            ...filter,
            $or: [
                { name: searchRegex },
                { trackingId: searchRegex },
                { indexNumber: searchRegex }
            ]
        }).limit(5).select('name trackingId indexNumber');

        // Search Placements (distinct companies or individual placements)
        const placements = await Placement.find({
            ...filter,
            companyName: searchRegex
        }).limit(5).select('companyName address');

        // Search Institutions (SuperAdmin only)
        let institutions = [];
        if (req.user.role === 'SuperAdmin') {
            institutions = await Institution.find({
                $or: [
                    { name: searchRegex },
                    { code: searchRegex }
                ]
            }).limit(5).select('name code');
        }

        res.json({
            learners,
            placements,
            institutions
        });
    } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({ message: 'Search failed' });
    }
});

// ==================== CALENDAR SYSTEM ====================

router.get('/calendar/events', async (req, res) => {
    try {
        const filter = getFilter(req.user);
        
        // 1. Learner Completions (from Placements)
        const completions = await Placement.find(filter)
            .populate('learner', 'name')
            .select('endDate companyName learner');

        const completionEvents = completions.map(c => ({
            id: `comp-${c._id}`,
            title: `Completion: ${c.learner?.name || 'Learner'}`,
            start: c.endDate,
            type: 'completion',
            description: `At ${c.companyName}`,
            color: '#10B981' // Green
        }));

        // 2. Monitoring Visits
        const visits = await MonitoringVisit.find(filter)
            .populate('learner', 'name')
            .select('visitDate learner visitType');

        const visitEvents = visits.map(v => ({
            id: `visit-${v._id}`,
            title: `Visit: ${v.learner?.name || 'Learner'}`,
            start: v.visitDate,
            type: 'visit',
            description: `${v.visitType} Visit`,
            color: '#3B82F6' // Blue
        }));

        // 3. Monthly Report Deadlines (Last Friday of each month for the current year)
        const currentYear = new Date().getFullYear();
        const reportEvents = [];
        for (let month = 0; month < 12; month++) {
            // Find last Friday of the month
            let lastDay = new Date(currentYear, month + 1, 0);
            while (lastDay.getDay() !== 5) { // 5 is Friday
                lastDay.setDate(lastDay.getDate() - 1);
            }
            reportEvents.push({
                id: `report-${month}`,
                title: 'Monthly Report Deadline',
                start: lastDay,
                type: 'report',
                description: 'Monthly submission due',
                color: '#F59E0B' // Orange
            });
        }

        res.json([...completionEvents, ...visitEvents, ...reportEvents]);
    } catch (error) {
        console.error("Calendar fetch error:", error);
        res.status(500).json({ message: 'Failed to fetch calendar events' });
    }
});

// ==================== MONTHLY REPORTS ====================

router.get('/monthly-reports', async (req, res) => {
    try {
      const filter = getFilter(req.user);
      const reports = await MonthlyReport.find(filter).populate('learner');
      res.json(reports);
    } catch (error) {
      res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/monthly-reports', async (req, res) => {
    try {
        const newReport = new MonthlyReport({
          ...req.body,
          institution: req.user.institution,
        });
        await newReport.save();
        res.status(201).json(newReport);
    } catch (error) {
        res.status(500).json({ message: 'Error creating report' });
    }
});

router.put('/monthly-reports/:id', async (req, res) => {
    try {
        const updatedReport = await MonthlyReport.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedReport);
    } catch (error) {
        res.status(500).json({ message: 'Error updating report' });
    }
});

router.delete('/monthly-reports/:id', async (req, res) => {
    try {
        await MonthlyReport.findByIdAndDelete(req.params.id);
        res.json({ message: 'Report deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting report' });
    }
});

// ==================== COMPETENCY ASSESSMENTS ====================

router.get('/assessments', async (req, res) => {
    try {
        const filter = getFilter(req.user);
        const assessments = await CompetencyAssessment.find(filter).populate('learner');
        res.json(assessments);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/assessments', async (req, res) => {
    try {
        const newAssessment = new CompetencyAssessment({
            ...req.body,
            institution: req.user.institution,
        });
        await newAssessment.save();

        // Automatically graduate learner
        if (req.body.learner) {
            await Learner.findByIdAndUpdate(req.body.learner, { status: 'Completed' });
        }

        res.status(201).json(newAssessment);
    } catch (error) {
        console.error("Error creating assessment:", error);
        res.status(500).json({ message: 'Error creating assessment' });
    }
});

router.put('/assessments/:id', async (req, res) => {
    try {
        const filter = getFilter(req.user);
        const updatedAssessment = await CompetencyAssessment.findOneAndUpdate(
            { _id: req.params.id, ...filter }, 
            req.body, 
            { new: true }
        );
        if (!updatedAssessment) return res.status(404).json({ message: 'Assessment not found or unauthorized' });
        res.json(updatedAssessment);
    } catch (error) {
        res.status(500).json({ message: 'Error updating assessment' });
    }
});

router.delete('/assessments/:id', async (req, res) => {
    try {
        const filter = getFilter(req.user);
        const deletedAssessment = await CompetencyAssessment.findOneAndDelete({ _id: req.params.id, ...filter });
        if (!deletedAssessment) return res.status(404).json({ message: 'Assessment not found or unauthorized' });
        res.json({ message: 'Assessment deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting assessment' });
    }
});

// ==================== LEARNERS ====================

router.get('/learners', async (req, res) => {
  try {
    const filter = getFilter(req.user);
    const learners = await Learner.find(filter).populate('placement');
    res.json(learners);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

router.post('/learners', async (req, res) => {
  try {
    const inst = await Institution.findOne({ name: req.user.institution });
    const region = inst ? inst.region : 'Unknown';

    const newLearner = new Learner({
      ...req.body,
      institution: req.user.institution,
      region: region,
    });
    await newLearner.save();
    res.status(201).json(newLearner);
  } catch (error) {
    res.status(500).json({ message: 'Error creating learner' });
  }
});

router.put('/learners/:id', async (req, res) => {
    try {
        const updatedLearner = await Learner.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedLearner);
    } catch (error) {
        res.status(500).json({ message: 'Error updating learner' });
    }
});

router.delete('/learners/:id', async (req, res) => {
    try {
        await Learner.findByIdAndDelete(req.params.id);
        res.json({ message: 'Learner deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting learner' });
    }
});

// ==================== LEARNER PROFILE ====================

router.get('/learners/:id/profile', async (req, res) => {
  try {
    const filter = getFilter(req.user);
    
    // 1. Fetch Learner
    const learner = await Learner.findOne({ _id: req.params.id, ...filter }).populate('placement');
    if (!learner) {
      return res.status(404).json({ message: 'Learner not found or unauthorized' });
    }

    // 2. Fetch Related Records
    const placements = await Placement.find({ learner: req.params.id, ...filter }).sort({ startDate: -1 });
    const visits = await MonitoringVisit.find({ learner: req.params.id, ...filter }).sort({ visitDate: -1 });
    const reports = await MonthlyReport.find({ learner: req.params.id, ...filter }).sort({ submissionDate: -1 });
    const assessments = await CompetencyAssessment.find({ learner: req.params.id, ...filter }).sort({ assessmentDate: -1 });

    // 3. Aggregate and Return
    res.json({
      learner,
      placements,
      visits,
      reports,
      assessments
    });
  } catch (error) {
    console.error("Error fetching learner profile:", error);
    res.status(500).json({ message: 'Server Error while fetching profile', detail: error.toString() });
  }
});

// ==================== PLACEMENTS ====================

router.get('/placements', async (req, res) => {
  try {
    const filter = getFilter(req.user);
    const placements = await Placement.find(filter).populate('learner');
    res.json(placements);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

router.post('/placements', async (req, res) => {
    try {
        const newPlacement = new Placement({
          ...req.body,
          institution: req.user.institution,
        });
        await newPlacement.save();

        // Automatically update learner status to 'Placed'
        if (req.body.learner) {
          await Learner.findByIdAndUpdate(req.body.learner, { status: 'Placed' });
        }

        res.status(201).json(newPlacement);
    } catch (error) {
        console.error("Error creating placement:", error);
        res.status(500).json({ message: 'Error creating placement' });
    }
});

router.put('/placements/:id', async (req, res) => {
    try {
        const updatedPlacement = await Placement.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedPlacement);
    } catch (error) {
        res.status(500).json({ message: 'Error updating placement' });
    }
});

router.delete('/placements/:id', async (req, res) => {
    try {
        await Placement.findByIdAndDelete(req.params.id);
        res.json({ message: 'Placement deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting placement' });
    }
});

// ==================== USERS (Admin/SuperAdmin only) ====================

router.get('/users', requireRole('Admin', 'SuperAdmin'), async (req, res) => {
    try {
        const filter = getFilter(req.user);
        const users = await User.find(filter);
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/users', requireRole('Admin', 'SuperAdmin'), async (req, res) => {
    try {
        const { role, institution, password } = req.body;

        // Scoping checks
        if (req.user.role !== 'SuperAdmin') {
            // Non-SuperAdmins cannot create SuperAdmins
            if (role === 'SuperAdmin') {
                return res.status(403).json({ message: 'Forbidden: Cannot create SuperAdmin' });
            }
            // Non-SuperAdmins can only create users for their own institution
            req.body.institution = req.user.institution;
        }

        if (!password) {
            return res.status(400).json({ message: 'Password is required' });
        }

        const newUser = new User({
          ...req.body,
        });
        await newUser.save();
        res.status(201).json(newUser);
    } catch (error) {
        console.error("Error creating user:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Email already exists' });
        }
        res.status(500).json({ message: 'Error creating user', error: error.message });
    }
});

router.put('/users/:id', requireRole('Admin', 'SuperAdmin'), async (req, res) => {
    try {
        const userToUpdate = await User.findById(req.params.id);
        if (!userToUpdate) return res.status(404).json({ message: 'User not found' });

        // Scoping checks
        if (req.user.role !== 'SuperAdmin') {
            if (userToUpdate.institution !== req.user.institution) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
            // Cannot promote to SuperAdmin
            if (req.body.role === 'SuperAdmin') {
                delete req.body.role;
            }
            // Cannot change institution
            delete req.body.institution;
        }

        // If password is provided, it will be hashed by the pre-save hook
        // We use save() instead of findByIdAndUpdate to trigger hooks
        Object.assign(userToUpdate, req.body);
        await userToUpdate.save();
        
        res.json(userToUpdate);
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: 'Error updating user' });
    }
});

router.delete('/users/:id', requireRole('Admin', 'SuperAdmin'), async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);
        if (!userToDelete) return res.status(404).json({ message: 'User not found' });

        if (req.user.role !== 'SuperAdmin' && userToDelete.institution !== req.user.institution) {
            return res.status(403).json({ message: 'Forbidden: Access denied' });
        }

        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user' });
    }
});

// ==================== INSTITUTIONS (SuperAdmin only) ====================

router.get('/institutions', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const institutions = await Institution.find().sort({ name: 1 });
        res.json(institutions);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/institutions', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const newInstitution = new Institution(req.body);
        await newInstitution.save();
        res.status(201).json(newInstitution);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Institution or Code already exists' });
        }
        res.status(500).json({ message: 'Error creating institution' });
    }
});

router.put('/institutions/:id', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const updatedInstitution = await Institution.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedInstitution);
    } catch (error) {
        res.status(500).json({ message: 'Error updating institution' });
    }
});

router.delete('/institutions/:id', requireRole('SuperAdmin'), async (req, res) => {
    try {
        await Institution.findByIdAndDelete(req.params.id);
        res.json({ message: 'Institution deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting institution' });
    }
});

// ==================== SUPER ADMIN OVERVIEW ====================

router.get('/admin/overview', requireRole('SuperAdmin'), async (req, res) => {
    try {
        // Aggregate stats per institution
        const institutionStats = await Learner.aggregate([
            { $group: { 
                _id: '$institution', 
                totalLearners: { $sum: 1 },
                placed: { $sum: { $cond: [{ $eq: ['$status', 'Placed'] }, 1, 0] } },
                pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
                dropped: { $sum: { $cond: [{ $eq: ['$status', 'Dropped'] }, 1, 0] } },
            }},
            { $sort: { totalLearners: -1 } }
        ]);

        // Aggregate stats by region
        const regionalStats = await Learner.aggregate([
            { $group: { 
                _id: '$region', 
                totalLearners: { $sum: 1 },
                placed: { $sum: { $cond: [{ $eq: ['$status', 'Placed'] }, 1, 0] } },
                institutions: { $addToSet: '$institution' }
            }},
            { $project: {
                region: '$_id',
                totalLearners: 1,
                placed: 1,
                institutionCount: { $size: '$institutions' },
                placementRate: { 
                    $cond: [
                        { $gt: ['$totalLearners', 0] },
                        { $multiply: [{ $divide: ['$placed', '$totalLearners'] }, 100] },
                        0
                    ]
                }
            }},
            { $sort: { totalLearners: -1 } }
        ]);

        const totalUsers = await User.countDocuments();
        const totalLearners = await Learner.countDocuments();
        const totalPlacements = await Placement.countDocuments();
        const totalVisits = await MonitoringVisit.countDocuments();
        const totalReports = await MonthlyReport.countDocuments();
        const institutions = await Institution.find().sort({ name: 1 });

        res.json({
            totalUsers,
            totalLearners,
            totalPlacements,
            totalVisits,
            totalReports,
            totalInstitutions: institutions.length,
            institutions: institutions.map(i => i.name),
            institutionDetails: institutions, // Full details for management
            institutionStats,
            regionalStats,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});

export default router;
