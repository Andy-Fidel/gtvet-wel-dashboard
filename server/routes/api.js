import express from 'express';
import mongoose from 'mongoose';
import { Learner } from '../models/Learner.js';
import { Placement } from '../models/Placement.js';
import { MonitoringVisit } from '../models/MonitoringVisit.js';
import { SemesterReport } from '../models/SemesterReport.js';
import { User } from '../models/User.js';
import { Institution } from '../models/Institution.js';
import { CompetencyAssessment } from '../models/CompetencyAssessment.js';
import { AcademicCalendar } from '../models/AcademicCalendar.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { PlacementRequest } from '../models/PlacementRequest.js';
import { EmployerEvaluation } from '../models/EmployerEvaluation.js';
import { AttendanceLog } from '../models/AttendanceLog.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { AuditLog } from '../models/AuditLog.js';
import { auth, requireRole } from '../middleware/auth.js';
import { Parser } from 'json2csv';
import { sendPlacementApprovalEmail, sendReportStatusEmail } from '../utils/mailer.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Notification } from '../models/Notification.js';
import { notifyUsers } from '../utils/notifications.js';
import { logAuditEvent } from '../utils/audit.js';

const router = express.Router();

// All routes below require authentication
router.use(auth);

// Helper: get institution filter (SuperAdmin sees all, RegionalAdmin sees their region)
const getFilter = async (user) => {
  if (user.role === 'SuperAdmin') return {};
  if (user.role === 'RegionalAdmin') {
     const insts = await Institution.find({ region: user.region }).select('name');
     const instNames = insts.map(i => i.name);
     return { institution: { $in: instNames } };
  }
  return { institution: user.institution };
};

// Helper: Notify Institution Admins
const notifyInstitutionAdmins = async (institutionName, emailFn, ...args) => {
    try {
        const admins = await User.find({ role: 'Admin', institution: institutionName });
        const emails = admins.map(u => u.email).filter(e => e).join(',');
        if (emails) {
            await emailFn(emails, ...args);
        }
    } catch(e) {
        console.error("Notify err:", e);
    }
}

const getPartnerId = (user) => user?.partnerId?._id || user?.partnerId || null;

const buildAttendanceScope = async (user) => {
  if (user.role === 'IndustryPartner') {
    return { partner: getPartnerId(user) };
  }
  return getFilter(user);
};

const validateAttendancePayload = ({ entryType, periodStart, periodEnd, hoursWorked }) => {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Invalid attendance date range';
  }

  if (end < start) {
    return 'Period end cannot be before period start';
  }

  if (entryType === 'Daily' && start.toDateString() !== end.toDateString()) {
    return 'Daily entries must start and end on the same date';
  }

  if (entryType === 'Weekly') {
    const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays > 6) {
      return 'Weekly entries cannot span more than 7 days';
    }
  }

  if (entryType === 'Daily' && (hoursWorked < 0 || hoursWorked > 24)) {
    return 'Daily entries must be between 0 and 24 hours';
  }

  if (entryType === 'Weekly' && (hoursWorked < 0 || hoursWorked > 168)) {
    return 'Weekly entries must be between 0 and 168 hours';
  }

  return null;
};

const getSupportTicketScope = async (user) => {
  if (user.role === 'SuperAdmin') return {};
  if (user.role === 'RegionalAdmin') {
    const insts = await Institution.find({ region: user.region }).select('name');
    return { institution: { $in: insts.map((inst) => inst.name) } };
  }
  if (user.role === 'IndustryPartner') {
    return { partnerId: getPartnerId(user) };
  }
  return { institution: user.institution };
};

const canManageSupportTicketStatus = (user, ticket) => {
  if (user.role === 'SuperAdmin') return true;
  if (user.role === 'RegionalAdmin') return true;
  if (user.role === 'Admin') return true;
  return ticket.requester?.toString() === user._id.toString();
};

const getAuditLogScope = async (user) => {
  if (user.role === 'SuperAdmin') return {};
  if (user.role === 'RegionalAdmin') {
    const insts = await Institution.find({ region: user.region }).select('name');
    return { institution: { $in: insts.map((inst) => inst.name) } };
  }
  return { institution: user.institution };
};

// ==================== NOTIFICATIONS ====================

router.get('/notifications', async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('sender', 'name role profilePicture');
        
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

router.put('/notifications/read-all', async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user._id, read: false },
            { $set: { read: true } }
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating notifications' });
    }
});

router.put('/notifications/:id/read', async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user._id },
            { $set: { read: true } },
            { new: true }
        );
        if (!notification) return res.status(404).json({ message: 'Notification not found' });
        res.json(notification);
    } catch (error) {
        res.status(500).json({ message: 'Error updating notification' });
    }
});

// ==================== SUPPORT CENTER ====================

router.get('/support-tickets', async (req, res) => {
    try {
        const scope = await getSupportTicketScope(req.user);
        const { status, category } = req.query;
        const query = { ...scope };

        if (status) query.status = status;
        if (category) query.category = category;

        const tickets = await SupportTicket.find(query)
            .populate('requester', 'name email role institution')
            .populate('replies.createdBy', 'name role')
            .sort({ updatedAt: -1, createdAt: -1 });

        res.json(tickets);
    } catch (error) {
        console.error('Error fetching support tickets:', error);
        res.status(500).json({ message: 'Error fetching support tickets' });
    }
});

router.post('/support-tickets', async (req, res) => {
    try {
        const { subject, category, priority, description } = req.body;

        const ticket = await SupportTicket.create({
            subject,
            category,
            priority,
            description,
            requester: req.user._id,
            institution: req.user.institution || 'N/A',
            region: req.user.region || '',
            partnerId: getPartnerId(req.user) || undefined,
            requesterRole: req.user.role,
        });

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'SupportTicket',
            entityId: ticket._id,
            summary: `Created support ticket "${ticket.subject}"`,
            after: ticket,
        });

        if (req.user.role !== 'SuperAdmin') {
            await notifyUsers({
                roles: ['SuperAdmin'],
                sender: req.user._id,
                type: 'system',
                title: 'New support ticket',
                message: `${req.user.name} submitted a ${priority.toLowerCase()} priority support request: ${subject}.`,
                link: '/support-center',
            });
        }

        const populated = await SupportTicket.findById(ticket._id)
            .populate('requester', 'name email role institution')
            .populate('replies.createdBy', 'name role');

        res.status(201).json(populated);
    } catch (error) {
        console.error('Error creating support ticket:', error);
        res.status(500).json({ message: 'Error creating support ticket' });
    }
});

router.post('/support-tickets/:id/replies', async (req, res) => {
    try {
        const scope = await getSupportTicketScope(req.user);
        const ticket = await SupportTicket.findOne({ _id: req.params.id, ...scope });
        if (!ticket) {
            return res.status(404).json({ message: 'Support ticket not found or unauthorized' });
        }

        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ message: 'Reply message is required' });
        }

        ticket.replies.push({
            message: message.trim(),
            createdBy: req.user._id,
            createdByName: req.user.name,
            createdByRole: req.user.role,
        });
        await ticket.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'SupportTicket',
            entityId: ticket._id,
            summary: `Added a reply to support ticket "${ticket.subject}"`,
            metadata: { replyMessage: message.trim() },
            changedFields: ['replies'],
        });

        const notifyRecipientIds = [];
        if (ticket.requester.toString() !== req.user._id.toString()) {
            notifyRecipientIds.push(ticket.requester.toString());
        }

        if (notifyRecipientIds.length > 0) {
            await notifyUsers({
                recipientIds: notifyRecipientIds,
                sender: req.user._id,
                type: 'system',
                title: 'Support ticket updated',
                message: `${req.user.name} replied to your support ticket: ${ticket.subject}.`,
                link: '/support-center',
            });
        }

        const populated = await SupportTicket.findById(ticket._id)
            .populate('requester', 'name email role institution')
            .populate('replies.createdBy', 'name role');

        res.json(populated);
    } catch (error) {
        console.error('Error replying to support ticket:', error);
        res.status(500).json({ message: 'Error replying to support ticket' });
    }
});

router.put('/support-tickets/:id/status', async (req, res) => {
    try {
        const scope = await getSupportTicketScope(req.user);
        const ticket = await SupportTicket.findOne({ _id: req.params.id, ...scope });
        if (!ticket) {
            return res.status(404).json({ message: 'Support ticket not found or unauthorized' });
        }

        if (!canManageSupportTicketStatus(req.user, ticket)) {
            return res.status(403).json({ message: 'You do not have permission to change this ticket status' });
        }

        const { status } = req.body;
        const allowedStatuses = ['Open', 'InProgress', 'Resolved', 'Closed'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid support ticket status' });
        }

        const before = ticket.toObject();
        ticket.status = status;
        await ticket.save();

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SupportTicket',
            entityId: ticket._id,
            summary: `Changed support ticket "${ticket.subject}" status to ${status}`,
            before,
            after: ticket,
            changedFields: ['status'],
        });

        if (ticket.requester.toString() !== req.user._id.toString()) {
            await notifyUsers({
                recipientIds: [ticket.requester.toString()],
                sender: req.user._id,
                type: 'system',
                title: 'Support ticket status updated',
                message: `Your ticket "${ticket.subject}" is now marked as ${status}.`,
                link: '/support-center',
            });
        }

        const populated = await SupportTicket.findById(ticket._id)
            .populate('requester', 'name email role institution')
            .populate('replies.createdBy', 'name role');

        res.json(populated);
    } catch (error) {
        console.error('Error updating support ticket status:', error);
        res.status(500).json({ message: 'Error updating support ticket status' });
    }
});

// ==================== AUDIT LOGS ====================

router.get('/audit-logs', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const scope = await getAuditLogScope(req.user);
        const { entityType, action, actorId, entityId, search, dateFrom, dateTo } = req.query;
        const query = { ...scope };

        if (entityType) query.entityType = entityType;
        if (action) query.action = action;
        if (actorId) query.actorId = actorId;
        if (entityId) query.entityId = { $regex: entityId, $options: 'i' };
        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }
        if (search) {
            query.$or = [
                { summary: { $regex: search, $options: 'i' } },
                { actorName: { $regex: search, $options: 'i' } },
                { entityType: { $regex: search, $options: 'i' } },
                { entityId: { $regex: search, $options: 'i' } },
            ];
        }

        const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(300);
        res.json(logs);
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ message: 'Error fetching audit logs' });
    }
});

router.get('/audit-logs/export', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const scope = await getAuditLogScope(req.user);
        const { entityType, action, actorId, entityId, search, dateFrom, dateTo } = req.query;
        const query = { ...scope };

        if (entityType) query.entityType = entityType;
        if (action) query.action = action;
        if (actorId) query.actorId = actorId;
        if (entityId) query.entityId = { $regex: entityId, $options: 'i' };
        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }
        if (search) {
            query.$or = [
                { summary: { $regex: search, $options: 'i' } },
                { actorName: { $regex: search, $options: 'i' } },
                { entityType: { $regex: search, $options: 'i' } },
                { entityId: { $regex: search, $options: 'i' } },
            ];
        }

        const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(1000);
        const rows = logs.map((log) => ({
            Timestamp: new Date(log.createdAt).toISOString(),
            Action: log.action,
            EntityType: log.entityType,
            EntityId: log.entityId,
            Summary: log.summary,
            ActorName: log.actorName,
            ActorRole: log.actorRole,
            Institution: log.institution || 'N/A',
            Route: log.route || '',
            Method: log.method || '',
            ChangedFields: log.changedFields?.join(', ') || '',
        }));

        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(rows);

        res.header('Content-Type', 'text/csv');
        res.attachment(`Audit_Log_Export_${new Date().toISOString().split('T')[0]}.csv`);
        return res.send(csv);
    } catch (error) {
        console.error('Error exporting audit logs:', error);
        res.status(500).json({ message: 'Error exporting audit logs' });
    }
});

// ==================== MONITORING VISITS ====================

router.get('/monitoring-visits/export', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const visits = await MonitoringVisit.find(filter)
            .populate({
                path: 'learner',
                populate: { path: 'placement' }
            })
            .sort({ visitDate: -1 });

        const mappedData = visits.map(v => ({
            'Learner Name': v.learner?.name || 'Unknown',
            'Tracking ID': v.learner?.trackingId || 'N/A',
            'Institution': v.institution || 'N/A',
            'Visit Date': new Date(v.visitDate).toLocaleDateString(),
            'Visit Type': v.visitType,
            'Attendance': v.attendanceStatus,
            'Performance Rating': `${v.performanceRating}/5`,
            'Issues Identified': v.issuesIdentified || 'None reported',
            'Action Taken': v.actionTaken || 'None',
            'Next Steps': v.nextSteps || 'None'
        }));

        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(mappedData);

        res.header('Content-Type', 'text/csv');
        res.attachment('Monitoring_Visits_Export.csv');
        return res.send(csv);
    } catch (error) {
        console.error("Export Error:", error);
        res.status(500).json({ message: 'Error exporting monitoring visits', error: error.message });
    }
});

router.get('/monitoring-visits', async (req, res) => {
    try {
      const filter = await getFilter(req.user);
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
        const { submittedLocation, ...visitData } = req.body;

        // Determine verification status
        let locationVerified = 'No GPS';
        let distanceFromSite = null;

        if (submittedLocation?.lat && submittedLocation?.lng && visitData.learner) {
            // Look up the learner's active placement coordinates
            const placement = await Placement.findOne({
                learner: visitData.learner,
                status: 'Active',
            });

            if (!placement || !placement.coordinates?.lat) {
                locationVerified = 'No Placement';
            } else {
                distanceFromSite = haversineDistance(
                    submittedLocation.lat, submittedLocation.lng,
                    placement.coordinates.lat, placement.coordinates.lng
                );
                locationVerified = distanceFromSite <= 500 ? 'Verified' : 'Unverified';
            }
        }

        const newVisit = new MonitoringVisit({
          ...visitData,
          submittedLocation: submittedLocation || undefined,
          locationVerified,
          distanceFromSite,
          submittedBy: req.user._id,
          institution: req.user.institution,
        });
        await newVisit.save();

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'MonitoringVisit',
            entityId: newVisit._id,
            summary: `Logged monitoring visit for learner ${visitData.learner}`,
            after: newVisit,
        });

        if (visitData.industryPartner) {
            notifyUsers({
                partnerId: visitData.industryPartner,
                sender: req.user._id,
                type: 'visit',
                title: 'Monitoring Visit Logged',
                message: `A monitoring visit report was submitted for your organization.`,
                link: '/partner-dashboard'
            });
        }

        res.status(201).json(newVisit);
    } catch (error) {
        console.error("Error creating visit:", error);
        res.status(500).json({ message: 'Error creating visit' });
    }
});

// Haversine formula: returns distance in metres between two GPS points
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in metres
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ==================== ANOMALY DETECTION ====================

router.get('/monitoring-visits/anomalies', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentVisits = await MonitoringVisit.find({
            ...filter,
            createdAt: { $gte: thirtyDaysAgo },
        })
            .populate('learner', 'name trackingId')
            .populate('submittedBy', 'name email')
            .sort({ createdAt: -1 });

        const anomalies = [];

        // Group visits by submitter
        const bySubmitter = {};
        for (const v of recentVisits) {
            const key = v.submittedBy?._id?.toString() || 'unknown';
            if (!bySubmitter[key]) bySubmitter[key] = [];
            bySubmitter[key].push(v);
        }

        for (const [, visits] of Object.entries(bySubmitter)) {
            // 1. Bulk submissions: >3 in 30 minutes
            for (let i = 0; i < visits.length; i++) {
                const window = visits.filter(v2 => {
                    const diff = Math.abs(new Date(v2.createdAt) - new Date(visits[i].createdAt));
                    return diff <= 30 * 60 * 1000 && v2._id.toString() !== visits[i]._id.toString();
                });
                if (window.length >= 3) {
                    anomalies.push({
                        type: 'bulk_submission',
                        severity: 'high',
                        message: `${visits[i].submittedBy?.name || 'Unknown'} submitted ${window.length + 1} visits within 30 minutes`,
                        visit: visits[i],
                        date: visits[i].createdAt,
                    });
                    break; // one flag per submitter
                }
            }

            // 2. Off-hours submissions (9PM – 5AM)
            for (const v of visits) {
                const hour = new Date(v.createdAt).getHours();
                if (hour >= 21 || hour < 5) {
                    anomalies.push({
                        type: 'off_hours',
                        severity: 'medium',
                        message: `Visit submitted at ${new Date(v.createdAt).toLocaleTimeString()} (outside working hours)`,
                        visit: v,
                        date: v.createdAt,
                    });
                }
            }

            // 3. Consistently no GPS
            const noGpsCount = visits.filter(v => v.locationVerified === 'No GPS').length;
            if (noGpsCount > 3 && noGpsCount / visits.length >= 0.8) {
                anomalies.push({
                    type: 'no_gps',
                    severity: 'medium',
                    message: `${visits[0].submittedBy?.name || 'Unknown'} has no GPS on ${noGpsCount}/${visits.length} recent visits`,
                    visit: visits[0],
                    date: visits[0].createdAt,
                });
            }
        }

        // 4. All unverified visits (submitted but far from site)
        const unverified = recentVisits
            .filter(v => v.locationVerified === 'Unverified')
            .map(v => ({
                type: 'location_mismatch',
                severity: 'high',
                message: `Visit submitted ${((v.distanceFromSite || 0) / 1000).toFixed(1)}km from placement site`,
                visit: v,
                date: v.createdAt,
            }));

        anomalies.push(...unverified);

        // Sort by date descending
        anomalies.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(anomalies);
    } catch (error) {
        console.error("Error fetching anomalies:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

router.put('/monitoring-visits/:id', async (req, res) => {
    try {
        const existingVisit = await MonitoringVisit.findById(req.params.id);
        const updatedVisit = await MonitoringVisit.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (updatedVisit && existingVisit) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'MonitoringVisit',
                entityId: updatedVisit._id,
                summary: `Updated monitoring visit ${updatedVisit._id}`,
                before: existingVisit,
                after: updatedVisit,
            });
        }
        res.json(updatedVisit);
    } catch (error) {
        res.status(500).json({ message: 'Error updating visit' });
    }
});

router.delete('/monitoring-visits/:id', async (req, res) => {
    try {
        const deletedVisit = await MonitoringVisit.findByIdAndDelete(req.params.id);
        if (deletedVisit) {
            await logAuditEvent({
                req,
                action: 'DELETE',
                entityType: 'MonitoringVisit',
                entityId: deletedVisit._id,
                summary: `Deleted monitoring visit ${deletedVisit._id}`,
                before: deletedVisit,
            });
        }
        res.json({ message: 'Visit deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting visit' });
    }
});

// ==================== DASHBOARD STATS ====================

router.get('/dashboard/stats', async (req, res) => {
  try {
    const filter = await getFilter(req.user);

    const totalLearners = await Learner.countDocuments(filter);
    const placedLearners = await Learner.countDocuments({ ...filter, status: { $in: ['Placed', 'Completed'] } });
    const pendingLearners = await Learner.countDocuments({ ...filter, status: 'Pending' });
    const totalVisits = await MonitoringVisit.countDocuments(filter);
    
    const recentPlacements = await Learner.find({ ...filter, status: 'Placed' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate('placement');

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const learnerTrend = await Learner.aggregate([
        { $match: { ...filter, createdAt: { $gte: sixMonthsAgo } } },
        { $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            total: { $sum: 1 }
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const monthlyStats = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const found = learnerTrend.find(l => l._id.year === year && l._id.month === month);
        monthlyStats.push({
            name: monthNames[month - 1],
            total: found ? found.total : 0
        });
    }

    res.json({
      totalLearners,
      placed: placedLearners,
      pending: pendingLearners,
      recentPlacements,
      monthlyStats,
      totalVisits
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error });
  }
});

router.get('/dashboard/action-alerts', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
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
        
        // Find all visits in the last 30 days and extract distinct learner IDs
        const recentVisits = await MonitoringVisit.find({ visitDate: { $gte: thirtyDaysAgo } }).select('learner');
        const recentlyVisitedLearnerIds = recentVisits.map(v => v.learner);

        // Query learners who are "Placed" but their ID is NOT in the recent visits list
        const needsVisitLearners = await Learner.find({
            ...filter,
            status: 'Placed',
            _id: { $nin: recentlyVisitedLearnerIds }
        }).select('name trackingId');

        needsVisitLearners.forEach(l => {
             alerts.push({
                type: 'Needs Visit',
                learnerId: l._id,
                learnerName: l.name,
                trackingId: l.trackingId,
                message: 'No monitoring visit logged in the last 30 days.',
                actionUrl: `/monitoring-visits?learnerId=${l._id}`
            });
        });

        // 3. Placed Learners close to completion (endDate < 14 days) without Competency Assessment
        const fourteenDaysFromNow = new Date();
        fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

        // Find all active placements ending within the next 14 days
        const endingSoonPlacements = await Placement.find({
            status: 'Active',
            endDate: { $lte: fourteenDaysFromNow }
        }).select('learner endDate');

        const endingSoonLearnerIds = endingSoonPlacements.map(p => p.learner);

        // If there are placements ending soon, check which ones lack an assessment
        if (endingSoonLearnerIds.length > 0) {
            // Find all assessments for these specific learners
            const existingAssessments = await CompetencyAssessment.find({
                learner: { $in: endingSoonLearnerIds }
            }).select('learner');
            const assessedLearnerIds = existingAssessments.map(a => a.learner.toString());

            // Filter down to the learners who do NOT have an assessment
            const unassessedLearnerIds = endingSoonLearnerIds.filter(id => !assessedLearnerIds.includes(id.toString()));

            if (unassessedLearnerIds.length > 0) {
                 const unassessedLearners = await Learner.find({ ...filter, _id: { $in: unassessedLearnerIds } }).select('name trackingId');
                 
                 unassessedLearners.forEach(l => {
                     alerts.push({
                        type: 'Needs Assessment',
                        learnerId: l._id,
                        learnerName: l.name,
                        trackingId: l.trackingId,
                        message: 'Placement ending soon. Final assessment required.',
                        actionUrl: `/competency-assessments?learnerId=${l._id}`
                    });
                 });
            }
        }

        res.json(alerts);
    } catch (error) {
        console.error("Error fetching action alerts:", error);
        res.status(500).json({ message: 'Server Error', error });
    }
});

router.get('/dashboard/map-data', async (req, res) => {
    try {
        const filter = await getFilter(req.user);

        // Map region names to approximate latitude/longitude
        const regionCoordinates = {
            "Greater Accra": [5.6037, -0.1870],
            "Ashanti": [6.6885, -1.6244],
            "Central": [5.1053, -1.2466],
            "Eastern": [6.0945, -0.2590],
            "Western": [5.1581, -2.2514],
            "Western North": [6.2575, -2.7667],
            "Volta": [6.6101, 0.4786],
            "Oti": [7.8860, 0.3541],
            "Northern": [9.4075, -0.8530],
            "Savannah": [9.0827, -1.8152],
            "North East": [10.5186, -0.3701],
            "Upper East": [10.7850, -0.8393],
            "Upper West": [10.0601, -2.5019],
            "Bono": [7.5855, -2.5517],
            "Bono East": [7.7854, -1.0425],
            "Ahafo": [6.9587, -2.4862]
        };

        // Find all active placements for calculating counts
        const placements = await Placement.find({ ...filter, status: 'Active' }).populate('learner', 'region');
        
        const countsByRegion = {};
        
        placements.forEach(p => {
             if (p.learner && p.learner.region) {
                 const region = p.learner.region;
                 countsByRegion[region] = (countsByRegion[region] || 0) + 1;
             }
        });

        // Format data for Leaflet
        const mapData = Object.keys(countsByRegion).map(region => ({
             region,
             count: countsByRegion[region],
             coordinates: regionCoordinates[region] || [7.9465, -1.0232] // Default broadly to center of Ghana
        }));

        res.json(mapData);
    } catch (error) {
        console.error("Error fetching map data:", error);
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

        const filter = await getFilter(req.user);
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
        const filter = await getFilter(req.user);
        
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
            color: '#10B981'
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
            color: '#3B82F6'
        }));

        // 3. Academic Calendar Events (from HQ)
        const academicEvents = await AcademicCalendar.find({ isActive: true });
        const hqEvents = academicEvents.map(e => ({
            id: `acad-${e._id}`,
            title: e.title,
            start: e.startDate,
            end: e.endDate,
            type: 'academic',
            eventType: e.eventType,
            description: e.description || `${e.semester} — ${e.academicYear}`,
            color: e.eventType === 'Semester Start' ? '#8B5CF6' :
                   e.eventType === 'Semester End' ? '#EC4899' :
                   e.eventType === 'Exam Period' ? '#EF4444' :
                   e.eventType === 'Holiday' ? '#10B981' :
                   e.eventType === 'Deadline' ? '#F59E0B' : '#6B7280'
        }));

        res.json([...completionEvents, ...visitEvents, ...hqEvents]);
    } catch (error) {
        console.error("Calendar fetch error:", error);
        res.status(500).json({ message: 'Failed to fetch calendar events' });
    }
});

// ==================== ACADEMIC CALENDAR CRUD (HQ Only) ====================

// List all academic calendar events
router.get('/academic-calendar', async (req, res) => {
    try {
        const events = await AcademicCalendar.find()
            .populate('createdBy', 'name email')
            .sort({ startDate: 1 });
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// Create academic calendar event
router.post('/academic-calendar', async (req, res) => {
    try {
        const event = new AcademicCalendar({
            ...req.body,
            createdBy: req.user._id,
        });
        await event.save();
        res.status(201).json(event);
    } catch (error) {
        console.error('Error creating academic event:', error);
        res.status(500).json({ message: 'Failed to create event' });
    }
});

// Update academic calendar event
router.put('/academic-calendar/:id', async (req, res) => {
    try {
        const event = await AcademicCalendar.findByIdAndUpdate(
            req.params.id,
            req.body,
            { returnDocument: 'after' }
        );
        if (!event) return res.status(404).json({ message: 'Event not found' });
        res.json(event);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update event' });
    }
});

// Delete academic calendar event
router.delete('/academic-calendar/:id', async (req, res) => {
    try {
        await AcademicCalendar.findByIdAndDelete(req.params.id);
        res.json({ message: 'Event deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete event' });
    }
});

// ==================== SEMESTER REPORTS ====================

// Generate a semester report (manual trigger)
router.post('/semester-reports/generate', async (req, res) => {
    try {
        const { semester, academicYear, periodStart, periodEnd } = req.body;
        const institution = req.user.institution;

        if (!semester || !academicYear || !periodStart || !periodEnd) {
            return res.status(400).json({ message: 'semester, academicYear, periodStart, and periodEnd are required.' });
        }

        const start = new Date(periodStart);
        const end = new Date(periodEnd);

        // Check for duplicate
        const exists = await SemesterReport.findOne({ institution, semester, academicYear });
        if (exists) {
            return res.status(409).json({ message: 'A report for this semester and academic year already exists.' });
        }

        // Aggregate learner stats
        const learners = await Learner.find({ institution, createdAt: { $lte: end } });
        const placed = learners.filter(l => l.status === 'Placed').length;
        const pending = learners.filter(l => l.status === 'Pending').length;
        const completed = learners.filter(l => l.status === 'Completed').length;
        const dropped = learners.filter(l => l.status === 'Dropped').length;

        // Program breakdown
        const programMap = {};
        learners.forEach(l => {
            programMap[l.program] = (programMap[l.program] || 0) + 1;
        });
        const programBreakdown = Object.entries(programMap).map(([program, count]) => ({ program, count }));

        // Monitoring visits in period
        const totalMonitoringVisits = await MonitoringVisit.countDocuments({
            institution,
            visitDate: { $gte: start, $lte: end }
        });

        // Competency assessments in period
        const totalCompetencyAssessments = await CompetencyAssessment.countDocuments({
            institution,
            createdAt: { $gte: start, $lte: end }
        });

        const report = new SemesterReport({
            institution,
            semester,
            academicYear,
            periodStart: start,
            periodEnd: end,
            generatedBy: req.user._id,
            status: 'Generated',
            summary: {
                totalLearners: learners.length,
                placed,
                pending,
                completed,
                dropped,
                totalMonitoringVisits,
                totalCompetencyAssessments,
                programBreakdown
            }
        });

        await report.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `Generated semester report for ${report.institution}`,
            after: report,
        });
        res.status(201).json(report);
    } catch (error) {
        console.error('Error generating semester report:', error);
        res.status(500).json({ message: 'Failed to generate semester report' });
    }
});

// List semester reports
router.get('/semester-reports', async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'RegionalAdmin') {
            const insts = await Institution.find({ region: req.user.region }).select('name');
            const instNames = insts.map(i => i.name);
            filter.institution = { $in: instNames };
        } else if (req.user.role !== 'SuperAdmin') {
            filter.institution = req.user.institution;
        }
        const reports = await SemesterReport.find(filter)
            .populate('generatedBy', 'name email')
            .populate('reviewedByRegional', 'name email')
            .populate('reviewedByHQ', 'name email')
            .sort({ createdAt: -1 });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// Get single semester report
router.get('/semester-reports/:id', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id)
            .populate('generatedBy', 'name email')
            .populate('reviewedByRegional', 'name email')
            .populate('reviewedByHQ', 'name email');
        if (!report) return res.status(404).json({ message: 'Report not found' });
        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// Submit report to Regional Office
router.put('/semester-reports/:id/submit', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        if (report.status !== 'Generated' && report.status !== 'Rejected') {
            return res.status(400).json({ message: 'Report can only be submitted when in Generated or Rejected status.' });
        }
        report.status = 'Submitted';
        await report.save();
        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `Submitted semester report for ${report.institution}`,
            changedFields: ['status'],
            after: report,
        });

        notifyUsers({
            roles: ['RegionalAdmin'],
            region: report.region,
            sender: req.user._id,
            type: 'report',
            title: 'Semester Report Submitted',
            message: `${report.institution} has submitted a new semester report.`,
            link: `/semester-reports/${report._id}`
        });

        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Failed to submit report' });
    }
});

// Regional Office approves
router.put('/semester-reports/:id/regional-approve', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        if (report.status !== 'Submitted') {
            return res.status(400).json({ message: 'Report must be in Submitted status to approve regionally.' });
        }
        const before = report.toObject();
        report.status = 'Regional_Approved';
        report.reviewedByRegional = req.user._id;
        report.regionalComment = req.body.comment || '';
        await report.save();
        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `Regionally approved semester report for ${report.institution}`,
            before,
            after: report,
        });

        notifyUsers({
            roles: ['SuperAdmin'],
            sender: req.user._id,
            type: 'report',
            title: 'Report Endorsed Regionally',
            message: `A report from ${report.institution} was regionally endorsed and requires HQ approval.`,
            link: `/semester-reports/${report._id}`
        });

        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Failed to approve report' });
    }
});

// HQ approves
router.put('/semester-reports/:id/hq-approve', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        if (report.status !== 'Regional_Approved') {
            return res.status(400).json({ message: 'Report must be Regional_Approved before HQ approval.' });
        }
        const before = report.toObject();
        report.status = 'HQ_Approved';
        report.reviewedByHQ = req.user._id;
        report.hqComment = req.body.comment || '';
        await report.save();
        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `HQ approved semester report for ${report.institution}`,
            before,
            after: report,
        });
        
        // Notify
        notifyInstitutionAdmins(report.institution, sendReportStatusEmail, report.semester, report.academicYear, 'HQ_Approved');
        
        notifyUsers({
            institution: report.institution,
            roles: ['Admin', 'RegionalAdmin'], // Also notify RegionalAdmin
            sender: req.user._id,
            type: 'report',
            title: 'Report Approved by HQ',
            message: `The semester report for ${report.institution} has been officially approved by HQ.`,
            link: `/semester-reports/${report._id}`
        });

        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Failed to approve report' });
    }
});

// Reject report
router.put('/semester-reports/:id/reject', async (req, res) => {
    try {
        const report = await SemesterReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        const before = report.toObject();
        report.status = 'Rejected';
        if (req.user.role === 'SuperAdmin') {
            report.reviewedByHQ = req.user._id;
            report.hqComment = req.body.comment || 'Rejected by HQ';
        } else {
            report.reviewedByRegional = req.user._id;
            report.regionalComment = req.body.comment || 'Rejected by Regional';
        }
        await report.save();
        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'SemesterReport',
            entityId: report._id,
            summary: `Rejected semester report for ${report.institution}`,
            before,
            after: report,
        });

        // Notify
        notifyInstitutionAdmins(report.institution, sendReportStatusEmail, report.semester, report.academicYear, 'Rejected');

        notifyUsers({
            institution: report.institution,
            roles: ['Admin', 'Manager', 'RegionalAdmin'],
            sender: req.user._id,
            type: 'report',
            title: 'Report Rejected',
            message: `The semester report for ${report.institution} was rejected. Reason: ${req.body.comment || 'N/A'}.`,
            link: `/semester-reports/${report._id}`
        });

        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Failed to reject report' });
    }
});

// ==================== COMPETENCY ASSESSMENTS ====================

router.get('/assessments', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const assessments = await CompetencyAssessment.find(filter).populate('learner');
        res.json(assessments);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/assessments', async (req, res) => {
    try {
        // Auto-populate trackingId from learner if not provided
        let trackingId = req.body.trackingId;
        if (!trackingId && req.body.learner) {
            const learner = await Learner.findById(req.body.learner);
            if (learner) trackingId = learner.trackingId;
        }

        const newAssessment = new CompetencyAssessment({
            ...req.body,
            trackingId,
            institution: req.user.institution,
        });
        await newAssessment.save();

        // Automatically graduate learner
        let learnerName = 'A learner';
        if (req.body.learner) {
            const updatedLearner = await Learner.findByIdAndUpdate(req.body.learner, { status: 'Completed' }, { new: true });
            if (updatedLearner) learnerName = updatedLearner.name;
        }

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'CompetencyAssessment',
            entityId: newAssessment._id,
            summary: `Created competency assessment for ${learnerName}`,
            after: newAssessment,
        });

        notifyUsers({
            institution: req.user.institution,
            roles: ['Admin', 'Manager'],
            sender: req.user._id,
            type: 'assessment',
            title: 'Competency Assessment Logged',
            message: `A competency assessment was completed for ${learnerName}.`,
            link: '/assessments'
        });

        res.status(201).json(newAssessment);
    } catch (error) {
        console.error("Error creating assessment:", error);
        res.status(500).json({ message: 'Error creating assessment', detail: error.message });
    }
});

router.put('/assessments/:id', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const existingAssessment = await CompetencyAssessment.findOne({ _id: req.params.id, ...filter });
        const updatedAssessment = await CompetencyAssessment.findOneAndUpdate(
            { _id: req.params.id, ...filter }, 
            req.body, 
            { returnDocument: 'after' }
        );
        if (!updatedAssessment) return res.status(404).json({ message: 'Assessment not found or unauthorized' });
        if (existingAssessment) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'CompetencyAssessment',
                entityId: updatedAssessment._id,
                summary: `Updated competency assessment ${updatedAssessment._id}`,
                before: existingAssessment,
                after: updatedAssessment,
            });
        }
        res.json(updatedAssessment);
    } catch (error) {
        res.status(500).json({ message: 'Error updating assessment' });
    }
});

router.delete('/assessments/:id', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const deletedAssessment = await CompetencyAssessment.findOneAndDelete({ _id: req.params.id, ...filter });
        if (!deletedAssessment) return res.status(404).json({ message: 'Assessment not found or unauthorized' });
        await logAuditEvent({
            req,
            action: 'DELETE',
            entityType: 'CompetencyAssessment',
            entityId: deletedAssessment._id,
            summary: `Deleted competency assessment ${deletedAssessment._id}`,
            before: deletedAssessment,
        });
        res.json({ message: 'Assessment deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting assessment' });
    }
});

// ==================== LEARNERS ====================

router.get('/learners', async (req, res) => {
  try {
    const filter = await getFilter(req.user);
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
    await logAuditEvent({
      req,
      action: 'CREATE',
      entityType: 'Learner',
      entityId: newLearner._id,
      summary: `Created learner ${newLearner.name}`,
      after: newLearner,
    });
    res.status(201).json(newLearner);
  } catch (error) {
    res.status(500).json({ message: 'Error creating learner' });
  }
});

// Bulk CSV upload
router.post('/learners/bulk', async (req, res) => {
  try {
    const { learners } = req.body;
    if (!Array.isArray(learners) || learners.length === 0) {
      return res.status(400).json({ message: 'No learner data provided' });
    }

    const inst = await Institution.findOne({ name: req.user.institution });
    const region = inst ? inst.region : 'Unknown';

    const results = { created: 0, errors: [] };

    for (let i = 0; i < learners.length; i++) {
      try {
        const row = learners[i];
        const learner = new Learner({
          lastName: row.lastName || row['Last Name'] || '',
          firstName: row.firstName || row['First Name'] || '',
          middleName: row.middleName || row['Middle Name'] || '',
          gender: row.gender || row['Gender'] || '',
          phone: row.phone || row['Phone'] || '',
          guardianContact: row.guardianContact || row['Guardian Contact'] || '',
          indexNumber: row.indexNumber || row['Index Number'] || '',
          program: row.program || row['Program'] || '',
          year: row.year || row['Year'] || '',
          institution: req.user.institution,
          region: region,
          status: 'Pending',
        });
        await learner.save();
        results.created++;
      } catch (err) {
        results.errors.push({ row: i + 1, message: err.message });
      }
    }

    await logAuditEvent({
      req,
      action: 'CREATE',
      entityType: 'LearnerBulkImport',
      entityId: `${req.user._id}-${Date.now()}`,
      summary: `Bulk imported ${results.created} learners`,
      metadata: results,
    });
    res.status(201).json(results);
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ message: 'Bulk upload failed' });
  }
});

router.get('/learners/:id', async (req, res) => {
  try {
    const filter = await getFilter(req.user);
    const learner = await Learner.findOne({ _id: req.params.id, ...filter }).populate('placement');

    if (!learner) {
      return res.status(404).json({ message: 'Learner not found or unauthorized' });
    }

    res.json(learner);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching learner' });
  }
});

router.put('/learners/:id', async (req, res) => {
    try {
        const existingLearner = await Learner.findById(req.params.id);
        const updatedLearner = await Learner.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (updatedLearner && existingLearner) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'Learner',
                entityId: updatedLearner._id,
                summary: `Updated learner ${updatedLearner.name}`,
                before: existingLearner,
                after: updatedLearner,
            });
        }
        res.json(updatedLearner);
    } catch (error) {
        res.status(500).json({ message: 'Error updating learner' });
    }
});

router.delete('/learners/:id', async (req, res) => {
    try {
        const deletedLearner = await Learner.findByIdAndDelete(req.params.id);
        if (deletedLearner) {
            await logAuditEvent({
                req,
                action: 'DELETE',
                entityType: 'Learner',
                entityId: deletedLearner._id,
                summary: `Deleted learner ${deletedLearner.name}`,
                before: deletedLearner,
            });
        }
        res.json({ message: 'Learner deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting learner' });
    }
});

// ==================== LEARNER PROFILE ====================

router.get('/learners/:id/profile', async (req, res) => {
  try {
    const filter = await getFilter(req.user);

    // 1. Fetch Learner
    const learner = await Learner.findOne({ _id: req.params.id, ...filter }).populate('placement');
    if (!learner) {
      return res.status(404).json({ message: 'Learner not found or unauthorized' });
    }

    // 2. Fetch Related Records
    const placements = await Placement.find({ learner: req.params.id, ...filter }).sort({ startDate: -1 });
    const visits = await MonitoringVisit.find({ learner: req.params.id, ...filter }).sort({ visitDate: -1 });
    const reports = await SemesterReport.find({ institution: learner.institution }).sort({ createdAt: -1 });
    const assessments = await CompetencyAssessment.find({ learner: req.params.id, ...filter }).sort({ assessmentDate: -1 });
    const evaluations = await EmployerEvaluation.find({ learner: req.params.id }).populate('partner', 'name').sort({ evaluationDate: -1 });

    // 3. Aggregate and Return
    res.json({
      learner,
      placements,
      visits,
      semesterReports: reports,
      assessments,
      evaluations
    });
  } catch (error) {
    console.error("Error fetching learner profile:", error);
    res.status(500).json({ message: 'Server Error while fetching profile', detail: error.toString() });
  }
});

// ==================== LEARNER PROGRESS TRACKING ====================

// Progress milestone weights
const PROGRESS_MILESTONES = {
  REGISTERED: { weight: 10, key: 'registered', label: 'Registered' },
  PLACED: { weight: 15, key: 'placed', label: 'Placed' },
  FIRST_MONITORING_VISIT: { weight: 10, key: 'firstVisit', label: 'First Monitoring Visit' },
  FIRST_COMPETENCY_ASSESSMENT: { weight: 15, key: 'firstAssessment', label: 'Competency Assessment' },
  EMPLOYER_EVALUATION: { weight: 15, key: 'employerEval', label: 'Employer Evaluation' },
  MIDPOINT_CHECK: { weight: 10, key: 'midpoint', label: 'Midpoint Check' },
  FINAL_ASSESSMENT: { weight: 15, key: 'finalAssessment', label: 'Final Assessment' },
  COMPLETED: { weight: 10, key: 'completed', label: 'Completed' },
};

// Helper: Calculate progress for a single learner
const calculateLearnerProgress = (learner, placements, visits, assessments, evaluations, semesterReports) => {
  const progress = {
    overall: 0,
    completedMilestones: [],
    pendingMilestones: [],
    categoryBreakdown: {
      placement: 0,
      assessment: 0,
      monitoring: 0,
      documentation: 0,
    },
    atRisk: false,
    atRiskReasons: [],
    placementProgress: null,
  };

  let totalWeight = 0;
  let earnedWeight = 0;

  // Milestone 1: Registered (always completed if learner exists)
  progress.completedMilestones.push({
    ...PROGRESS_MILESTONES.REGISTERED,
    completedAt: learner.createdAt,
  });
  earnedWeight += PROGRESS_MILESTONES.REGISTERED.weight;
  totalWeight += PROGRESS_MILESTONES.REGISTERED.weight;

  // Milestone 2: Placed
  if (learner.status === 'Placed' || learner.status === 'Completed' || placements.length > 0) {
    const placement = placements[0];
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.PLACED,
      completedAt: placement?.startDate || learner.updatedAt,
      details: { companyName: placement?.companyName, sector: placement?.sector },
    });
    earnedWeight += PROGRESS_MILESTONES.PLACED.weight;
    progress.categoryBreakdown.placement = 100;
  } else {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.PLACED);
  }
  totalWeight += PROGRESS_MILESTONES.PLACED.weight;

  // Milestone 3: First Monitoring Visit
  if (visits.length > 0) {
    const firstVisit = visits.reduce((min, v) => v.visitDate < min.visitDate ? v : min, visits[0]);
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.FIRST_MONITORING_VISIT,
      completedAt: firstVisit.visitDate,
      details: { visitType: firstVisit.visitType, performanceRating: firstVisit.performanceRating },
    });
    earnedWeight += PROGRESS_MILESTONES.FIRST_MONITORING_VISIT.weight;
    progress.categoryBreakdown.monitoring = Math.min(100, (visits.length / 2) * 100); // Assume 2 visits expected
  } else if (learner.status === 'Placed' || learner.status === 'Completed') {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.FIRST_MONITORING_VISIT);
  }
  totalWeight += PROGRESS_MILESTONES.FIRST_MONITORING_VISIT.weight;

  // Milestone 4: First Competency Assessment
  if (assessments.length > 0) {
    const firstAssessment = assessments.reduce((min, a) => a.assessmentDate < min.assessmentDate ? a : min, assessments[0]);
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.FIRST_COMPETENCY_ASSESSMENT,
      completedAt: firstAssessment.assessmentDate,
      details: { overallScore: firstAssessment.overallScore, assessmentType: firstAssessment.assessmentType },
    });
    earnedWeight += PROGRESS_MILESTONES.FIRST_COMPETENCY_ASSESSMENT.weight;
    progress.categoryBreakdown.assessment = Math.min(100, (assessments.length / 2) * 100); // Assume 2 assessments expected
  } else if (learner.status === 'Placed' || learner.status === 'Completed') {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.FIRST_COMPETENCY_ASSESSMENT);
  }
  totalWeight += PROGRESS_MILESTONES.FIRST_COMPETENCY_ASSESSMENT.weight;

  // Milestone 5: Employer Evaluation
  if (evaluations.length > 0) {
    const firstEval = evaluations.reduce((min, e) => e.evaluationDate < min.evaluationDate ? e : min, evaluations[0]);
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.EMPLOYER_EVALUATION,
      completedAt: firstEval.evaluationDate,
      details: { overallScore: firstEval.overallScore, wouldHire: firstEval.wouldHire },
    });
    earnedWeight += PROGRESS_MILESTONES.EMPLOYER_EVALUATION.weight;
  } else if (learner.status === 'Placed' || learner.status === 'Completed') {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.EMPLOYER_EVALUATION);
  }
  totalWeight += PROGRESS_MILESTONES.EMPLOYER_EVALUATION.weight;

  // Milestone 6: Midpoint Check (based on placement duration)
  const currentPlacement = placements.find(p => p.status === 'Active');
  if (currentPlacement && currentPlacement.startDate) {
    const startDate = new Date(currentPlacement.startDate);
    const endDate = currentPlacement.endDate ? new Date(currentPlacement.endDate) : null;
    const today = new Date();
    const totalDuration = endDate ? endDate - startDate : 90 * 24 * 60 * 60 * 1000; // Default 90 days
    const elapsed = today - startDate;
    const progress_percent = Math.min(100, (elapsed / totalDuration) * 100);

    progress.placementProgress = {
      startDate: startDate,
      endDate: endDate,
      elapsedDays: Math.floor(elapsed / (1000 * 60 * 60 * 24)),
      totalDays: Math.floor(totalDuration / (1000 * 60 * 60 * 24)),
      remainingDays: Math.max(0, Math.floor((totalDuration - elapsed) / (1000 * 60 * 60 * 24))),
      percent: Math.round(progress_percent),
    };

    if (progress_percent >= 50) {
      progress.completedMilestones.push({
        ...PROGRESS_MILESTONES.MIDPOINT_CHECK,
        completedAt: new Date(startDate.getTime() + (totalDuration * 0.5)),
      });
      earnedWeight += PROGRESS_MILESTONES.MIDPOINT_CHECK.weight;
    } else {
      progress.pendingMilestones.push(PROGRESS_MILESTONES.MIDPOINT_CHECK);
    }

    // At-risk check: if progress is significantly behind
    const expectedProgress = 50; // Should be at 50% by midpoint
    if (progress_percent < expectedProgress - 20) {
      progress.atRisk = true;
      progress.atRiskReasons.push('Placement duration behind schedule');
    }
  }
  totalWeight += PROGRESS_MILESTONES.MIDPOINT_CHECK.weight;

  // Milestone 7: Final Assessment
  if (learner.status === 'Completed' && assessments.length > 1) {
    const finalAssessment = assessments.reduce((max, a) => a.assessmentDate > max.assessmentDate ? a : max, assessments[0]);
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.FINAL_ASSESSMENT,
      completedAt: finalAssessment.assessmentDate,
      details: { overallScore: finalAssessment.overallScore },
    });
    earnedWeight += PROGRESS_MILESTONES.FINAL_ASSESSMENT.weight;
  } else if (learner.status === 'Completed') {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.FINAL_ASSESSMENT);
  } else if (progress.placementProgress && progress.placementProgress.percent >= 80) {
    progress.pendingMilestones.push(PROGRESS_MILESTONES.FINAL_ASSESSMENT);
  }
  totalWeight += PROGRESS_MILESTONES.FINAL_ASSESSMENT.weight;

  // Milestone 8: Completed
  if (learner.status === 'Completed') {
    progress.completedMilestones.push({
      ...PROGRESS_MILESTONES.COMPLETED,
      completedAt: learner.updatedAt,
    });
    earnedWeight += PROGRESS_MILESTONES.COMPLETED.weight;
  }
  totalWeight += PROGRESS_MILESTONES.COMPLETED.weight;

  // Documentation progress (semester reports)
  progress.categoryBreakdown.documentation = semesterReports.length > 0 ? Math.min(100, semesterReports.length * 50) : 0;

  // Calculate overall progress percentage
  progress.overall = Math.round((earnedWeight / totalWeight) * 100);

  // Additional at-risk checks
  if (learner.status === 'Dropped') {
    progress.atRisk = true;
    progress.atRiskReasons.push('Learner status is Dropped');
  }

  if (assessments.length > 0) {
    const avgScore = assessments.reduce((sum, a) => sum + (a.overallScore || 0), 0) / assessments.length;
    if (avgScore < 2.5) {
      progress.atRisk = true;
      progress.atRiskReasons.push('Low assessment scores');
    }
  }

  if (evaluations.length > 0 && !evaluations[0].wouldHire) {
    progress.atRisk = true;
    progress.atRiskReasons.push('Employer would not re-hire');
  }

  return progress;
};

// GET /api/learners/:id/progress - Get progress for a single learner
router.get('/learners/:id/progress', async (req, res) => {
  try {
    const filter = await getFilter(req.user);

    // Fetch learner
    const learner = await Learner.findOne({ _id: req.params.id, ...filter });
    if (!learner) {
      return res.status(404).json({ message: 'Learner not found or unauthorized' });
    }

    // Fetch related records
    const placements = await Placement.find({ learner: req.params.id }).sort({ startDate: -1 });
    const visits = await MonitoringVisit.find({ learner: req.params.id }).sort({ visitDate: -1 });
    const assessments = await CompetencyAssessment.find({ learner: req.params.id }).sort({ assessmentDate: -1 });
    const evaluations = await EmployerEvaluation.find({ learner: req.params.id }).sort({ evaluationDate: -1 });
    const semesterReports = await SemesterReport.find({ institution: learner.institution }).sort({ createdAt: -1 });

    // Calculate progress
    const progress = calculateLearnerProgress(learner, placements, visits, assessments, evaluations, semesterReports);

    res.json({
      learner: {
        _id: learner._id,
        name: learner.name,
        trackingId: learner.trackingId,
        status: learner.status,
        program: learner.program,
        year: learner.year,
      },
      progress,
    });
  } catch (error) {
    console.error("Error fetching learner progress:", error);
    res.status(500).json({ message: 'Server Error while fetching progress', detail: error.toString() });
  }
});

// GET /api/learners/progress/bulk - Get progress summary for multiple learners
router.get('/learners/progress/bulk', async (req, res) => {
  try {
    const filter = await getFilter(req.user);
    const { program, year, status } = req.query;

    // Build query
    const query = { ...filter };
    if (program) query.program = program;
    if (year) query.year = year;
    if (status) query.status = status;

    // Fetch learners
    const learners = await Learner.find(query).sort({ createdAt: -1 });

    // Fetch all related data in bulk
    const learnerIds = learners.map(l => l._id);
    const placements = await Placement.find({ learner: { $in: learnerIds } });
    const visits = await MonitoringVisit.find({ learner: { $in: learnerIds } });
    const assessments = await CompetencyAssessment.find({ learner: { $in: learnerIds } });
    const evaluations = await EmployerEvaluation.find({ learner: { $in: learnerIds } });

    // Get unique institutions for semester reports
    const institutions = [...new Set(learners.map(l => l.institution))];
    const semesterReports = await SemesterReport.find({ institution: { $in: institutions } });

    // Calculate progress for each learner
    const progressSummary = learners.map(learner => {
      const learnerPlacements = placements.filter(p => p.learner.toString() === learner._id.toString());
      const learnerVisits = visits.filter(v => v.learner.toString() === learner._id.toString());
      const learnerAssessments = assessments.filter(a => a.learner.toString() === learner._id.toString());
      const learnerEvaluations = evaluations.filter(e => e.learner.toString() === learner._id.toString());
      const learnerReports = semesterReports.filter(r => r.institution === learner.institution);

      const progress = calculateLearnerProgress(
        learner,
        learnerPlacements,
        learnerVisits,
        learnerAssessments,
        learnerEvaluations,
        learnerReports
      );

      return {
        learner: {
          _id: learner._id,
          name: learner.name,
          trackingId: learner.trackingId,
          status: learner.status,
          program: learner.program,
          year: learner.year,
        },
        progress: {
          overall: progress.overall,
          atRisk: progress.atRisk,
          atRiskReasons: progress.atRiskReasons,
          categoryBreakdown: progress.categoryBreakdown,
        },
      };
    });

    // Aggregate statistics
    const stats = {
      totalLearners: progressSummary.length,
      averageProgress: progressSummary.length > 0
        ? Math.round(progressSummary.reduce((sum, p) => sum + p.progress.overall, 0) / progressSummary.length)
        : 0,
      atRiskCount: progressSummary.filter(p => p.progress.atRisk).length,
      completedCount: progressSummary.filter(p => p.learner.status === 'Completed').length,
      placedCount: progressSummary.filter(p => p.learner.status === 'Placed').length,
    };

    res.json({
      learners: progressSummary,
      stats,
    });
  } catch (error) {
    console.error("Error fetching bulk progress:", error);
    res.status(500).json({ message: 'Server Error while fetching bulk progress', detail: error.toString() });
  }
});

// ==================== PLACEMENTS ====================

router.get('/placements/export', async (req, res) => {
  try {
    const filter = await getFilter(req.user);
    const placements = await Placement.find(filter)
        .populate('learner')
        .sort({ startDate: -1 });

    const mappedData = placements.map(p => ({
        'Learner Name': p.learner?.name || 'Unknown',
        'Tracking ID': p.learner?.trackingId || 'N/A',
        'Program': p.learner?.program || 'N/A',
        'Institution': p.institution || 'N/A',
        'Company Name': p.companyName,
        'Sector': p.sector,
        'Location': p.location,
        'Supervisor Name': p.supervisorName,
        'Supervisor Email': p.supervisorEmail || 'N/A',
        'Start Date': new Date(p.startDate).toLocaleDateString(),
        'End Date': new Date(p.endDate).toLocaleDateString(),
        'Status': p.status
    }));

    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(mappedData);

    res.header('Content-Type', 'text/csv');
    res.attachment('Placements_Export.csv');
    return res.send(csv);
  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({ message: 'Error exporting placements', error: error.message });
  }
});

router.get('/placements', async (req, res) => {
  try {
    const filter = await getFilter(req.user);
    const placements = await Placement.find(filter).populate('learner');
    res.json(placements);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

router.post('/placements', async (req, res) => {
    try {
        const { learner, learners, ...placementData } = req.body;
        const learnerIds = learners || (learner ? [learner] : []);

        if (learnerIds.length === 0) {
            return res.status(400).json({ message: 'At least one learner must be selected' });
        }

        const placementDocs = learnerIds.map(id => ({
            ...placementData,
            learner: id,
            institution: req.user.institution,
            status: 'Active'
        }));

        const createdPlacements = await Placement.insertMany(placementDocs);

        // Automatically update learner status to 'Placed'
        for (const placement of createdPlacements) {
            const updatedLearner = await Learner.findByIdAndUpdate(placement.learner, { 
                status: 'Placed',
                placement: placement._id
            }, { new: true });
            
            if (req.body.partner) {
                notifyUsers({
                    partnerId: req.body.partner,
                    sender: req.user._id,
                    type: 'placement',
                    title: 'New Placement',
                    message: `${updatedLearner?.name || 'A learner'} has been placed with your organization.`,
                    link: '/partner-dashboard'
                });
            }
        }

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'Placement',
            entityId: createdPlacements.map((placement) => placement._id).join(','),
            summary: `Created ${createdPlacements.length} placement record(s)`,
            metadata: { placementIds: createdPlacements.map((placement) => placement._id), learnerIds },
            after: createdPlacements,
        });

        res.status(201).json(createdPlacements);
    } catch (error) {
        console.error("Error creating placement:", error);
        res.status(500).json({ message: 'Error creating placement' });
    }
});

router.put('/placements/:id', async (req, res) => {
    try {
        const existingPlacement = await Placement.findById(req.params.id);
        const updatedPlacement = await Placement.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (updatedPlacement && existingPlacement) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'Placement',
                entityId: updatedPlacement._id,
                summary: `Updated placement ${updatedPlacement._id}`,
                before: existingPlacement,
                after: updatedPlacement,
            });
        }
        res.json(updatedPlacement);
    } catch (error) {
        res.status(500).json({ message: 'Error updating placement' });
    }
});

router.delete('/placements/:id', async (req, res) => {
    try {
        const deletedPlacement = await Placement.findByIdAndDelete(req.params.id);
        if (deletedPlacement) {
            await logAuditEvent({
                req,
                action: 'DELETE',
                entityType: 'Placement',
                entityId: deletedPlacement._id,
                summary: `Deleted placement ${deletedPlacement._id}`,
                before: deletedPlacement,
            });
        }
        res.json({ message: 'Placement deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting placement' });
    }
});

// ==================== ATTENDANCE LOGS ====================

router.get('/attendance-logs', async (req, res) => {
    try {
        const scope = await buildAttendanceScope(req.user);
        const { learnerId, placementId, status, entryType } = req.query;
        const query = { ...scope };

        if (learnerId) query.learner = learnerId;
        if (placementId) query.placement = placementId;
        if (status) query.status = status;
        if (entryType) query.entryType = entryType;

        const logs = await AttendanceLog.find(query)
            .populate('learner', 'name trackingId program')
            .populate('placement', 'companyName supervisorName supervisorEmail startDate endDate status')
            .populate('submittedBy', 'name role')
            .populate('signedOffBy', 'name role')
            .sort({ periodStart: -1, createdAt: -1 });

        res.json(logs);
    } catch (error) {
        console.error('Error fetching attendance logs:', error);
        res.status(500).json({ message: 'Error fetching attendance logs' });
    }
});

router.post('/attendance-logs', async (req, res) => {
    try {
        if (req.user.role === 'IndustryPartner') {
            return res.status(403).json({ message: 'Industry partners cannot create attendance logs' });
        }

        const { learner: learnerId, entryType, periodStart, periodEnd, hoursWorked, tasksCompleted, notes } = req.body;
        const validationError = validateAttendancePayload({ entryType, periodStart, periodEnd, hoursWorked });
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        const filter = await getFilter(req.user);
        const learner = await Learner.findOne({ _id: learnerId, ...filter });
        if (!learner) {
            return res.status(404).json({ message: 'Learner not found or unauthorized' });
        }

        const placement = await Placement.findOne({ learner: learnerId, institution: learner.institution })
            .sort({ startDate: -1 });
        if (!placement) {
            return res.status(400).json({ message: 'Learner does not have a placement record yet' });
        }

        const newLog = await AttendanceLog.create({
            learner: learner._id,
            placement: placement._id,
            partner: placement.partner,
            institution: learner.institution,
            entryType,
            periodStart,
            periodEnd,
            hoursWorked,
            tasksCompleted,
            notes: notes || '',
            submittedBy: req.user._id,
        });

        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'AttendanceLog',
            entityId: newLog._id,
            summary: `Created ${entryType.toLowerCase()} attendance log for learner ${learner.name}`,
            after: newLog,
        });

        if (placement.partner) {
            await notifyUsers({
                partnerId: placement.partner,
                sender: req.user._id,
                type: 'report',
                title: 'Hours awaiting sign-off',
                message: `${learner.name} has a new ${entryType.toLowerCase()} attendance entry ready for supervisor review.`,
                link: '/attendance-logs',
            });
        }

        const populated = await AttendanceLog.findById(newLog._id)
            .populate('learner', 'name trackingId program')
            .populate('placement', 'companyName supervisorName supervisorEmail startDate endDate status')
            .populate('submittedBy', 'name role')
            .populate('signedOffBy', 'name role');

        res.status(201).json(populated);
    } catch (error) {
        console.error('Error creating attendance log:', error);
        res.status(500).json({ message: 'Error creating attendance log' });
    }
});

router.put('/attendance-logs/:id', async (req, res) => {
    try {
        if (req.user.role === 'IndustryPartner') {
            return res.status(403).json({ message: 'Industry partners cannot edit attendance logs' });
        }

        const filter = await getFilter(req.user);
        const attendanceLog = await AttendanceLog.findOne({ _id: req.params.id, ...filter });
        if (!attendanceLog) {
            return res.status(404).json({ message: 'Attendance log not found or unauthorized' });
        }

        if (attendanceLog.status === 'SignedOff') {
            return res.status(400).json({ message: 'Signed-off entries cannot be edited' });
        }

        const { entryType, periodStart, periodEnd, hoursWorked, tasksCompleted, notes } = req.body;
        const validationError = validateAttendancePayload({ entryType, periodStart, periodEnd, hoursWorked });
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        const before = attendanceLog.toObject();
        attendanceLog.entryType = entryType;
        attendanceLog.periodStart = periodStart;
        attendanceLog.periodEnd = periodEnd;
        attendanceLog.hoursWorked = hoursWorked;
        attendanceLog.tasksCompleted = tasksCompleted;
        attendanceLog.notes = notes || '';
        attendanceLog.status = 'Pending';
        attendanceLog.supervisorComment = '';
        attendanceLog.signedOffAt = undefined;
        attendanceLog.signedOffBy = undefined;
        await attendanceLog.save();

        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'AttendanceLog',
            entityId: attendanceLog._id,
            summary: `Updated attendance log ${attendanceLog._id}`,
            before,
            after: attendanceLog,
        });

        const populated = await AttendanceLog.findById(attendanceLog._id)
            .populate('learner', 'name trackingId program')
            .populate('placement', 'companyName supervisorName supervisorEmail startDate endDate status')
            .populate('submittedBy', 'name role')
            .populate('signedOffBy', 'name role');

        res.json(populated);
    } catch (error) {
        console.error('Error updating attendance log:', error);
        res.status(500).json({ message: 'Error updating attendance log' });
    }
});

router.delete('/attendance-logs/:id', async (req, res) => {
    try {
        if (req.user.role === 'IndustryPartner') {
            return res.status(403).json({ message: 'Industry partners cannot delete attendance logs' });
        }

        const filter = await getFilter(req.user);
        const attendanceLog = await AttendanceLog.findOne({ _id: req.params.id, ...filter });
        if (!attendanceLog) {
            return res.status(404).json({ message: 'Attendance log not found or unauthorized' });
        }

        if (attendanceLog.status === 'SignedOff') {
            return res.status(400).json({ message: 'Signed-off entries cannot be deleted' });
        }

        await AttendanceLog.deleteOne({ _id: attendanceLog._id });
        await logAuditEvent({
            req,
            action: 'DELETE',
            entityType: 'AttendanceLog',
            entityId: attendanceLog._id,
            summary: `Deleted attendance log ${attendanceLog._id}`,
            before: attendanceLog,
        });
        res.json({ message: 'Attendance log deleted' });
    } catch (error) {
        console.error('Error deleting attendance log:', error);
        res.status(500).json({ message: 'Error deleting attendance log' });
    }
});

router.put('/attendance-logs/:id/sign-off', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const attendanceLog = await AttendanceLog.findOne({
            _id: req.params.id,
            partner: getPartnerId(req.user),
        }).populate('learner', 'name');

        if (!attendanceLog) {
            return res.status(404).json({ message: 'Attendance log not found' });
        }

        const before = attendanceLog.toObject();
        attendanceLog.status = 'SignedOff';
        attendanceLog.supervisorComment = req.body.supervisorComment || '';
        attendanceLog.signedOffAt = new Date();
        attendanceLog.signedOffBy = req.user._id;
        await attendanceLog.save();

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'AttendanceLog',
            entityId: attendanceLog._id,
            summary: `Signed off attendance log ${attendanceLog._id}`,
            before,
            after: attendanceLog,
        });

        await notifyUsers({
            institution: attendanceLog.institution,
            sender: req.user._id,
            type: 'report',
            title: 'Hours signed off',
            message: `${attendanceLog.learner?.name || 'A learner'}'s attendance hours were signed off by the supervisor.`,
            link: '/attendance-logs',
        });

        const populated = await AttendanceLog.findById(attendanceLog._id)
            .populate('learner', 'name trackingId program')
            .populate('placement', 'companyName supervisorName supervisorEmail startDate endDate status')
            .populate('submittedBy', 'name role')
            .populate('signedOffBy', 'name role');

        res.json(populated);
    } catch (error) {
        console.error('Error signing off attendance log:', error);
        res.status(500).json({ message: 'Error signing off attendance log' });
    }
});

router.put('/attendance-logs/:id/reject', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const attendanceLog = await AttendanceLog.findOne({
            _id: req.params.id,
            partner: getPartnerId(req.user),
        }).populate('learner', 'name');

        if (!attendanceLog) {
            return res.status(404).json({ message: 'Attendance log not found' });
        }

        const before = attendanceLog.toObject();
        attendanceLog.status = 'Rejected';
        attendanceLog.supervisorComment = req.body.supervisorComment || '';
        attendanceLog.signedOffAt = new Date();
        attendanceLog.signedOffBy = req.user._id;
        await attendanceLog.save();

        await logAuditEvent({
            req,
            action: 'STATUS_CHANGE',
            entityType: 'AttendanceLog',
            entityId: attendanceLog._id,
            summary: `Rejected attendance log ${attendanceLog._id}`,
            before,
            after: attendanceLog,
        });

        await notifyUsers({
            institution: attendanceLog.institution,
            sender: req.user._id,
            type: 'report',
            title: 'Hours returned for review',
            message: `${attendanceLog.learner?.name || 'A learner'}'s attendance entry was returned by the supervisor.`,
            link: '/attendance-logs',
        });

        const populated = await AttendanceLog.findById(attendanceLog._id)
            .populate('learner', 'name trackingId program')
            .populate('placement', 'companyName supervisorName supervisorEmail startDate endDate status')
            .populate('submittedBy', 'name role')
            .populate('signedOffBy', 'name role');

        res.json(populated);
    } catch (error) {
        console.error('Error rejecting attendance log:', error);
        res.status(500).json({ message: 'Error rejecting attendance log' });
    }
});

// ==================== USERS (Admin/SuperAdmin only) ====================

router.get('/users', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const users = await User.find(filter).populate('partnerId', 'name');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/users', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const { role, institution, password, partnerId } = req.body;

        // Scoping checks
        if (req.user.role !== 'SuperAdmin' && role === 'IndustryPartner') {
            return res.status(403).json({ message: 'Forbidden: Only SuperAdmins can create Industry Partners accounts' });
        }
        if (req.user.role === 'SuperAdmin') {
            // SuperAdmin can create any user
        } else if (req.user.role === 'RegionalAdmin') {
            // RegionalAdmin cannot create SuperAdmins or other RegionalAdmins
            if (role === 'SuperAdmin' || role === 'RegionalAdmin') {
                return res.status(403).json({ message: 'Forbidden: Cannot create this role' });
            }
            // Validate institution is in their region
            const insts = await Institution.find({ region: req.user.region }).select('name');
            const instNames = insts.map(i => i.name);
            if (!instNames.includes(institution)) {
                return res.status(403).json({ message: 'Forbidden: Institution not in your region' });
            }
            // Auto-assign region
            req.body.region = req.user.region;
        } else {
            // Non-SuperAdmins cannot create SuperAdmins
            if (role === 'SuperAdmin') {
                return res.status(403).json({ message: 'Forbidden: Cannot create SuperAdmin' });
            }
            // Non-SuperAdmins can only create users for their own institution
            req.body.institution = req.user.institution;
        }

        let generatedPassword = null;
        if (role === 'IndustryPartner' && !institution) {
            req.body.institution = 'N/A';
        }

        if (!password) {
            // Generate an 8-character random password
            generatedPassword = crypto.randomBytes(4).toString('hex');
            req.body.password = generatedPassword;
        }

        const newUser = new User({
          ...req.body,
        });
        await newUser.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'User',
            entityId: newUser._id,
            summary: `Created user ${newUser.name}`,
            after: newUser,
        });
        
        const userJson = newUser.toJSON();
        if (generatedPassword) {
            userJson.defaultPassword = generatedPassword;
        }

        res.status(201).json(userJson);
    } catch (error) {
        console.error("Error creating user:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Email already exists' });
        }
        res.status(500).json({ message: 'Error creating user', error: error.message });
    }
});

router.put('/users/:id', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const userToUpdate = await User.findById(req.params.id);
        if (!userToUpdate) return res.status(404).json({ message: 'User not found' });

        // Scoping checks
        if (req.user.role === 'SuperAdmin') {
            // SuperAdmin can update any user
        } else if (req.user.role === 'RegionalAdmin') {
            // RegionalAdmin can only update users in institutions within their region
            const insts = await Institution.find({ region: req.user.region }).select('name');
            const instNames = insts.map(i => i.name);
            if (!instNames.includes(userToUpdate.institution)) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
            // Cannot promote to SuperAdmin, RegionalAdmin, or IndustryPartner
            if (req.body.role === 'SuperAdmin' || req.body.role === 'RegionalAdmin' || req.body.role === 'IndustryPartner') {
                delete req.body.role;
            }
            // Cannot change institution outside their region
            if (req.body.institution && !instNames.includes(req.body.institution)) {
                return res.status(403).json({ message: 'Forbidden: Invalid institution' });
            }
        } else {
            // Regular Admin/Manager
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
        if ((userToUpdate.role === 'IndustryPartner' || req.body.role === 'IndustryPartner') && !req.body.institution && !userToUpdate.institution) {
            req.body.institution = 'N/A';
        }
        const before = userToUpdate.toObject();
        Object.assign(userToUpdate, req.body);
        await userToUpdate.save();
        await logAuditEvent({
            req,
            action: 'UPDATE',
            entityType: 'User',
            entityId: userToUpdate._id,
            summary: `Updated user ${userToUpdate.name}`,
            before,
            after: userToUpdate,
        });
        const populatedUser = await User.findById(userToUpdate._id).populate('partnerId');
        res.json(populatedUser);
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: 'Error updating user' });
    }
});

router.delete('/users/:id', requireRole('Admin', 'SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);
        if (!userToDelete) return res.status(404).json({ message: 'User not found' });

        if (req.user.role === 'SuperAdmin') {
            // SuperAdmin can delete any user
        } else if (req.user.role === 'RegionalAdmin') {
            // RegionalAdmin can only delete users in institutions within their region
            const insts = await Institution.find({ region: req.user.region }).select('name');
            const instNames = insts.map(i => i.name);
            if (!instNames.includes(userToDelete.institution)) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
        } else {
            // Regular Admin/Manager can only delete users from their own institution
            if (userToDelete.institution !== req.user.institution) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
        }

        await User.findByIdAndDelete(req.params.id);
        await logAuditEvent({
            req,
            action: 'DELETE',
            entityType: 'User',
            entityId: userToDelete._id,
            summary: `Deleted user ${userToDelete.name}`,
            before: userToDelete,
        });
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user' });
    }
});

// ==================== MY INSTITUTION ====================

router.get('/my-institution', async (req, res) => {
    try {
        const inst = await Institution.findOne({ name: req.user.institution });
        if (!inst) return res.status(404).json({ message: 'Institution not found' });
        res.json(inst);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==================== INSTITUTIONS (SuperAdmin only) ====================

router.get('/institutions', requireRole('SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const filter = {};
        // RegionalAdmin can only see their own region's institutions
        if (req.user.role === 'RegionalAdmin') {
            filter.region = req.user.region;
        } else if (req.query.region) {
            // SuperAdmin can filter by region via query param
            filter.region = req.query.region;
        }
        const institutions = await Institution.find(filter).sort({ name: 1 });
        res.json(institutions);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/institutions', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const newInstitution = new Institution(req.body);
        await newInstitution.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'Institution',
            entityId: newInstitution._id,
            summary: `Created institution ${newInstitution.name}`,
            after: newInstitution,
        });
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
        const existingInstitution = await Institution.findById(req.params.id);
        const updatedInstitution = await Institution.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (updatedInstitution && existingInstitution) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'Institution',
                entityId: updatedInstitution._id,
                summary: `Updated institution ${updatedInstitution.name}`,
                before: existingInstitution,
                after: updatedInstitution,
            });
        }
        res.json(updatedInstitution);
    } catch (error) {
        res.status(500).json({ message: 'Error updating institution' });
    }
});

router.delete('/institutions/:id', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const deletedInstitution = await Institution.findByIdAndDelete(req.params.id);
        if (deletedInstitution) {
            await logAuditEvent({
                req,
                action: 'DELETE',
                entityType: 'Institution',
                entityId: deletedInstitution._id,
                summary: `Deleted institution ${deletedInstitution.name}`,
                before: deletedInstitution,
            });
        }
        res.json({ message: 'Institution deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting institution' });
    }
});

// ==================== SUPER ADMIN OVERVIEW ====================

router.get('/admin/overview', requireRole('SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const instFilter = Object.keys(filter).length > 0 ? { name: filter.institution } : {};
        const supportScope = await getSupportTicketScope(req.user);
        const auditScope = await getAuditLogScope(req.user);
        const attendanceScope = await buildAttendanceScope(req.user);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const now = new Date();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Aggregate stats per institution
        const institutionStats = await Learner.aggregate([
            { $match: filter },
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
        const regionalStatsBase = await Learner.aggregate([
            { $match: filter },
            { $group: { 
                _id: '$region', 
                totalLearners: { $sum: 1 },
                placed: { $sum: { $cond: [{ $eq: ['$status', 'Placed'] }, 1, 0] } },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
                institutions: { $addToSet: '$institution' }
            }},
            { $project: {
                region: '$_id',
                totalLearners: 1,
                placed: 1,
                completed: 1,
                institutionCount: { $size: '$institutions' },
                placementRate: { 
                    $cond: [
                        { $gt: ['$totalLearners', 0] },
                        { $multiply: [{ $divide: ['$placed', '$totalLearners'] }, 100] },
                        0
                    ]
                },
                completionRate: {
                    $cond: [
                        { $gt: ['$totalLearners', 0] },
                        { $multiply: [{ $divide: ['$completed', '$totalLearners'] }, 100] },
                        0
                    ]
                }
            }},
            { $sort: { totalLearners: -1 } }
        ]);

        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const sparklineMonthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const monthlyRegionalPlacements = await Placement.aggregate([
            { $match: { ...filter, createdAt: { $gte: previousMonthStart } } },
            {
                $lookup: {
                    from: 'learners',
                    localField: 'learner',
                    foreignField: '_id',
                    as: 'learnerDoc'
                }
            },
            { $unwind: '$learnerDoc' },
            {
                $project: {
                    region: '$learnerDoc.region',
                    monthBucket: {
                        $cond: [
                            { $gte: ['$createdAt', currentMonthStart] },
                            'current',
                            'previous'
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: { region: '$region', monthBucket: '$monthBucket' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const regionalPlacementMovement = monthlyRegionalPlacements.reduce((acc, item) => {
            const region = item._id.region || 'Unknown';
            if (!acc[region]) {
                acc[region] = { currentMonthPlacements: 0, previousMonthPlacements: 0 };
            }
            if (item._id.monthBucket === 'current') {
                acc[region].currentMonthPlacements = item.count;
            } else {
                acc[region].previousMonthPlacements = item.count;
            }
            return acc;
        }, {});

        const regionalPlacementTrendRaw = await Placement.aggregate([
            { $match: { ...filter, createdAt: { $gte: sparklineMonthStart } } },
            {
                $lookup: {
                    from: 'learners',
                    localField: 'learner',
                    foreignField: '_id',
                    as: 'learnerDoc'
                }
            },
            { $unwind: '$learnerDoc' },
            {
                $group: {
                    _id: {
                        region: '$learnerDoc.region',
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        const regionalPlacementTrend = regionalPlacementTrendRaw.reduce((acc, item) => {
            const region = item._id.region || 'Unknown';
            if (!acc[region]) {
                acc[region] = {};
            }
            acc[region][`${item._id.year}-${item._id.month}`] = item.count;
            return acc;
        }, {});

        const regionalStats = regionalStatsBase
            .map((regionStat) => {
                const movement = regionalPlacementMovement[regionStat.region || 'Unknown'] || {
                    currentMonthPlacements: 0,
                    previousMonthPlacements: 0,
                };
                const monthOverMonthDelta = movement.currentMonthPlacements - movement.previousMonthPlacements;
                const monthOverMonthPercent = movement.previousMonthPlacements > 0
                    ? Math.round((monthOverMonthDelta / movement.previousMonthPlacements) * 100)
                    : (movement.currentMonthPlacements > 0 ? 100 : 0);
                const needsIntervention = regionStat.placementRate < 45 || regionStat.completionRate < 20 || monthOverMonthDelta < 0;
                const interventionReasons = [];
                if (regionStat.placementRate < 45) interventionReasons.push('Low placement rate');
                if (regionStat.completionRate < 20) interventionReasons.push('Low completion rate');
                if (monthOverMonthDelta < 0) interventionReasons.push('Placements falling month-over-month');

                return {
                    ...regionStat,
                    currentMonthPlacements: movement.currentMonthPlacements,
                    previousMonthPlacements: movement.previousMonthPlacements,
                    monthOverMonthDelta,
                    monthOverMonthPercent,
                    movementDirection: monthOverMonthDelta > 0 ? 'up' : monthOverMonthDelta < 0 ? 'down' : 'flat',
                    needsIntervention,
                    interventionReasons,
                    sparkline: Array.from({ length: 6 }, (_, offset) => {
                        const d = new Date(now.getFullYear(), now.getMonth() - (5 - offset), 1);
                        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
                        return {
                            month: monthNames[d.getMonth()],
                            count: regionalPlacementTrend[regionStat.region || 'Unknown']?.[key] || 0,
                        };
                    }),
                };
            })
            .sort((a, b) => {
                if (b.placementRate !== a.placementRate) return b.placementRate - a.placementRate;
                return b.completionRate - a.completionRate;
            });

        // Users: RegionalAdmin users don't have 'institution', they have 'region'
        let totalUsers;
        if (req.user.role === 'RegionalAdmin') {
            totalUsers = await User.countDocuments({ $or: [{ institution: filter.institution }, { region: req.user.region }] });
        } else {
            totalUsers = await User.countDocuments();
        }
        const totalLearners = await Learner.countDocuments(filter);
        const totalPlacements = await Placement.countDocuments(filter);
        const totalVisits = await MonitoringVisit.countDocuments(filter);
        // Semester Report filter scoped by institution names
        const reportFilter = Object.keys(filter).length > 0 ? { institution: filter.institution } : {};
        const totalReports = await SemesterReport.countDocuments(reportFilter);
        const institutions = await Institution.find(instFilter).sort({ name: 1 });
        const partnerFilter = req.user.role === 'RegionalAdmin' ? { region: req.user.region } : {};
        const totalPartners = await IndustryPartner.countDocuments(partnerFilter);
        const partnersDetails = await IndustryPartner.find(partnerFilter).sort({ createdAt: -1 });

        // Overall placement rate
        const placedLearners = await Learner.countDocuments({ ...filter, status: 'Placed' });
        const overallPlacementRate = totalLearners > 0
            ? Math.round((placedLearners / totalLearners) * 100)
            : 0;

        // Placement trend — last 12 months
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);
        twelveMonthsAgo.setHours(0, 0, 0, 0);

        const placementTrend = await Placement.aggregate([
            { $match: { ...filter, createdAt: { $gte: twelveMonthsAgo } } },
            { $group: {
                _id: { 
                    year: { $year: '$createdAt' }, 
                    month: { $month: '$createdAt' } 
                },
                count: { $sum: 1 }
            }},
            { $sort: { '_id.year': 1, '_id.month': 1 } },
            { $project: {
                _id: 0,
                year: '$_id.year',
                month: '$_id.month',
                count: 1
            }}
        ]);

        // Fill in missing months with 0
        const filledTrend = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const found = placementTrend.find(p => p.year === year && p.month === month);
            filledTrend.push({
                name: monthNames[month - 1],
                year,
                month,
                count: found ? found.count : 0
            });
        }
        // Gender distribution
        const genderDistribution = await Learner.aggregate([
            { $match: filter },
            { $group: { _id: '$gender', count: { $sum: 1 } } },
            { $project: { _id: 0, gender: { $ifNull: ['$_id', 'Unknown'] }, count: 1 } },
            { $sort: { count: -1 } }
        ]);

        // Trade/Program distribution
        const programDistribution = await Learner.aggregate([
            { $match: filter },
            { $group: { _id: '$program', count: { $sum: 1 } } },
            { $project: { _id: 0, program: { $ifNull: ['$_id', 'Unknown'] }, count: 1 } },
            { $sort: { count: -1 } }
        ]);

        // Average time to placement (in days)
        const avgTimePipeline = await Placement.aggregate([
            { $match: filter },
            { $lookup: {
                from: 'learners',
                localField: 'learner',
                foreignField: '_id',
                as: 'learnerDoc'
            }},
            { $unwind: '$learnerDoc' },
            { $project: {
                daysToPlace: {
                    $divide: [
                        { $subtract: ['$createdAt', '$learnerDoc.createdAt'] },
                        1000 * 60 * 60 * 24 // ms to days
                    ]
                }
            }},
            { $group: { _id: null, avgDays: { $avg: '$daysToPlace' } } }
        ]);
        const avgTimeToPlacement = avgTimePipeline.length > 0
            ? Math.round(avgTimePipeline[0].avgDays)
            : 0;

        // Report approval pipeline — count per status
        const reportPipeline = await SemesterReport.aggregate([
            { $match: reportFilter },
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $project: { _id: 0, status: '$_id', count: 1 } }
        ]);

        // Pending reports needing action from this user's role
        const pendingReports = req.user.role === 'RegionalAdmin'
            ? await SemesterReport.countDocuments({ ...reportFilter, status: 'Submitted' })
            : await SemesterReport.countDocuments({ ...reportFilter, status: 'Regional_Approved' });

        const approvalQueueFilter = req.user.role === 'RegionalAdmin'
            ? { ...reportFilter, status: 'Submitted' }
            : { ...reportFilter, status: 'Regional_Approved' };
        const approvalQueue = await SemesterReport.find(approvalQueueFilter)
            .sort({ createdAt: 1 })
            .limit(6)
            .select('institution semester academicYear status createdAt');
        const overdueApprovals = await SemesterReport.countDocuments({
            ...approvalQueueFilter,
            createdAt: { $lte: sevenDaysAgo },
        });
        const recentRejectedReports = await SemesterReport.find({ ...reportFilter, status: 'Rejected' })
            .sort({ updatedAt: -1 })
            .limit(5)
            .select('institution semester academicYear updatedAt');

        const unresolvedSupportFilter = {
            ...supportScope,
            status: { $in: ['Open', 'InProgress'] },
        };
        const [supportStats, supportCategoryBreakdown, supportRegionBreakdown, supportQueue] = await Promise.all([
            SupportTicket.aggregate([
                { $match: supportScope },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        open: { $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] } },
                        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'InProgress'] }, 1, 0] } },
                        urgentOpen: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ['$priority', 'Urgent'] },
                                            { $in: ['$status', ['Open', 'InProgress']] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },
                    },
                },
            ]),
            SupportTicket.aggregate([
                { $match: unresolvedSupportFilter },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $project: { _id: 0, category: '$_id', count: 1 } },
                { $sort: { count: -1 } },
            ]),
            SupportTicket.aggregate([
                { $match: unresolvedSupportFilter },
                { $group: { _id: { $ifNull: ['$region', 'Unassigned'] }, count: { $sum: 1 } } },
                { $project: { _id: 0, region: '$_id', count: 1 } },
                { $sort: { count: -1 } },
            ]),
            SupportTicket.find(unresolvedSupportFilter)
                .populate('requester', 'name')
                .sort({ updatedAt: 1, createdAt: 1 })
                .limit(6)
                .select('subject priority status institution region createdAt updatedAt replies requester'),
        ]);
        const oldestOpenTicket = await SupportTicket.findOne(unresolvedSupportFilter)
            .sort({ createdAt: 1 })
            .select('createdAt');
        const oldestOpenTicketAgeDays = oldestOpenTicket
            ? Math.max(0, Math.floor((Date.now() - oldestOpenTicket.createdAt.getTime()) / (1000 * 60 * 60 * 24)))
            : 0;

        const recentSensitiveEventsFilter = {
            ...auditScope,
            $or: [
                { action: 'DELETE' },
                { action: 'AUTH' },
                { action: 'STATUS_CHANGE' },
                { entityType: 'User' },
            ],
        };
        const [auditEventCount, deleteEventCount, authEventCount, statusChangeEventCount, topActors, recentSensitiveEvents] = await Promise.all([
            AuditLog.countDocuments({ ...auditScope, createdAt: { $gte: sevenDaysAgo } }),
            AuditLog.countDocuments({ ...auditScope, action: 'DELETE', createdAt: { $gte: sevenDaysAgo } }),
            AuditLog.countDocuments({ ...auditScope, action: 'AUTH', createdAt: { $gte: sevenDaysAgo } }),
            AuditLog.countDocuments({ ...auditScope, action: 'STATUS_CHANGE', createdAt: { $gte: sevenDaysAgo } }),
            AuditLog.aggregate([
                { $match: { ...auditScope, createdAt: { $gte: sevenDaysAgo } } },
                {
                    $group: {
                        _id: { actorId: '$actorId', actorName: '$actorName', actorRole: '$actorRole' },
                        count: { $sum: 1 },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        actorId: '$_id.actorId',
                        actorName: '$_id.actorName',
                        actorRole: '$_id.actorRole',
                        count: 1,
                    },
                },
                { $sort: { count: -1 } },
                { $limit: 5 },
            ]),
            AuditLog.find(recentSensitiveEventsFilter)
                .sort({ createdAt: -1 })
                .limit(6)
                .select('action entityType summary actorName actorRole institution createdAt'),
        ]);

        const [stalePendingLearners, placementsMissingSupervisor, pendingAttendanceSignOff, activePlacementsWithoutVisits] = await Promise.all([
            Learner.countDocuments({
                ...filter,
                status: 'Pending',
                createdAt: { $lte: fourteenDaysAgo },
            }),
            Placement.countDocuments({
                ...filter,
                status: 'Active',
                $or: [
                    { supervisorName: { $exists: false } },
                    { supervisorName: '' },
                    { supervisorEmail: { $exists: false } },
                    { supervisorEmail: '' },
                ],
            }),
            AttendanceLog.countDocuments({
                ...attendanceScope,
                status: 'Pending',
                createdAt: { $lte: threeDaysAgo },
            }),
            Placement.aggregate([
                {
                    $match: {
                        ...filter,
                        status: 'Active',
                        startDate: { $lte: fourteenDaysAgo },
                    },
                },
                {
                    $lookup: {
                        from: 'monitoringvisits',
                        localField: 'learner',
                        foreignField: 'learner',
                        as: 'visits',
                    },
                },
                { $match: { visits: { $eq: [] } } },
                { $count: 'count' },
            ]),
        ]);

        const calendarScope = req.user.role === 'RegionalAdmin'
            ? { region: req.user.region }
            : {};
        const activeCalendarEvents = await AcademicCalendar.find({ isActive: true }).sort({ startDate: 1 });
        const upcomingDeadlines = activeCalendarEvents
            .filter((event) => event.eventType === 'Deadline' && event.endDate >= now)
            .slice(0, 5)
            .map((event) => ({
                _id: event._id,
                title: event.title,
                startDate: event.startDate,
                endDate: event.endDate,
                semester: event.semester || '',
                academicYear: event.academicYear || '',
                description: event.description || '',
                daysRemaining: Math.max(0, Math.ceil((event.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
            }));

        const cycleDeadlines = activeCalendarEvents
            .filter((event) => event.eventType === 'Deadline' && event.semester && event.academicYear)
            .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
        const currentCycleDeadline = cycleDeadlines.find((event) => event.endDate >= now)
            || [...cycleDeadlines].reverse().find((event) => event.endDate < now)
            || null;

        let deadlineRisk = {
            currentCycle: null,
            overdueInstitutionSubmissions: [],
            atRiskInstitutions: [],
        };

        if (currentCycleDeadline) {
            const cycleReports = await SemesterReport.find({
                institution: { $in: institutions.map((institution) => institution.name) },
                semester: currentCycleDeadline.semester,
                academicYear: currentCycleDeadline.academicYear,
            }).select('institution status updatedAt');

            const reportByInstitution = cycleReports.reduce((acc, report) => {
                acc[report.institution] = report;
                return acc;
            }, {});

            const isSubmittedForCycle = (report) => report && !['Generated', 'Rejected'].includes(report.status);
            const daysUntilDeadline = Math.ceil((currentCycleDeadline.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            const overdueInstitutionSubmissions = institutions
                .filter((institution) => {
                    const report = reportByInstitution[institution.name];
                    return currentCycleDeadline.endDate < now && !isSubmittedForCycle(report);
                })
                .map((institution) => {
                    const report = reportByInstitution[institution.name];
                    return {
                        _id: institution._id,
                        institution: institution.name,
                        region: institution.region,
                        status: report?.status || 'Missing',
                        code: institution.code,
                    };
                })
                .slice(0, 8);

            const atRiskInstitutions = institutions
                .filter((institution) => {
                    const report = reportByInstitution[institution.name];
                    return currentCycleDeadline.endDate >= now && daysUntilDeadline <= 14 && !isSubmittedForCycle(report);
                })
                .map((institution) => {
                    const report = reportByInstitution[institution.name];
                    return {
                        _id: institution._id,
                        institution: institution.name,
                        region: institution.region,
                        status: report?.status || 'Not started',
                        code: institution.code,
                        daysRemaining: Math.max(0, daysUntilDeadline),
                    };
                })
                .slice(0, 8);

            deadlineRisk = {
                currentCycle: {
                    title: currentCycleDeadline.title,
                    semester: currentCycleDeadline.semester,
                    academicYear: currentCycleDeadline.academicYear,
                    endDate: currentCycleDeadline.endDate,
                    daysRemaining: Math.max(daysUntilDeadline, 0),
                    isOverdue: currentCycleDeadline.endDate < now,
                },
                overdueInstitutionSubmissions,
                atRiskInstitutions,
            };
        }

        const userScope = req.user.role === 'RegionalAdmin'
            ? {
                $or: [
                    { institution: filter.institution },
                    { region: req.user.region },
                ],
            }
            : {};
        const governedUsers = await User.find(userScope).select('role status institution region passwordChangeRequired');
        const roleBreakdownMap = governedUsers.reduce((acc, user) => {
            acc[user.role] = (acc[user.role] || 0) + 1;
            return acc;
        }, {});
        const inactiveUsers = governedUsers.filter((user) => user.status === 'Inactive').length;
        const pendingPasswordResets = governedUsers.filter((user) => user.passwordChangeRequired).length;

        const activeAdminsByInstitution = governedUsers.reduce((acc, user) => {
            if (user.role === 'Admin' && user.status === 'Active' && user.institution) {
                acc[user.institution] = (acc[user.institution] || 0) + 1;
            }
            return acc;
        }, {});

        const institutionsWithoutActiveAdmins = institutions
            .filter((institution) => !activeAdminsByInstitution[institution.name])
            .map((institution) => ({
                _id: institution._id,
                name: institution.name,
                region: institution.region,
                code: institution.code,
            }))
            .slice(0, 8);

        const privilegedUserAnomalies = Object.values(governedUsers.reduce((acc, user) => {
            if (!user.institution || !['Admin', 'Manager'].includes(user.role)) {
                return acc;
            }

            if (!acc[user.institution]) {
                acc[user.institution] = {
                    institution: user.institution,
                    adminCount: 0,
                    managerCount: 0,
                    privilegedCount: 0,
                    activePrivilegedCount: 0,
                };
            }

            if (user.role === 'Admin') acc[user.institution].adminCount += 1;
            if (user.role === 'Manager') acc[user.institution].managerCount += 1;
            acc[user.institution].privilegedCount += 1;
            if (user.status === 'Active') {
                acc[user.institution].activePrivilegedCount += 1;
            }
            return acc;
        }, {}))
            .filter((entry) => entry.activePrivilegedCount > 3 || entry.adminCount > 1)
            .sort((a, b) => b.activePrivilegedCount - a.activePrivilegedCount)
            .slice(0, 8)
            .map((entry) => ({
                ...entry,
                reasons: [
                    ...(entry.adminCount > 1 ? ['Multiple admins assigned'] : []),
                    ...(entry.activePrivilegedCount > 3 ? ['High privileged-user count'] : []),
                ],
            }));

        res.json({
            totalUsers,
            totalLearners,
            totalPlacements,
            totalVisits,
            totalReports,
            totalPartners,
            partnersDetails,
            totalInstitutions: institutions.length,
            institutions: institutions.map(i => i.name),
            institutionDetails: institutions,
            institutionStats,
            regionalStats,
            overallPlacementRate,
            placementTrend: filledTrend,
            genderDistribution,
            programDistribution,
            avgTimeToPlacement,
            pendingReports,
            reportPipeline,
            approvalInbox: {
                pendingCount: pendingReports,
                overdueCount: overdueApprovals,
                recentRejectedCount: recentRejectedReports.length,
                queue: approvalQueue.map((report) => ({
                    _id: report._id,
                    institution: report.institution,
                    title: `${report.semester} ${report.academicYear}`,
                    status: report.status,
                    createdAt: report.createdAt,
                    ageDays: Math.max(0, Math.floor((Date.now() - report.createdAt.getTime()) / (1000 * 60 * 60 * 24))),
                })),
                recentRejected: recentRejectedReports.map((report) => ({
                    _id: report._id,
                    institution: report.institution,
                    title: `${report.semester} ${report.academicYear}`,
                    updatedAt: report.updatedAt,
                })),
            },
            supportSummary: {
                total: supportStats[0]?.total || 0,
                open: supportStats[0]?.open || 0,
                inProgress: supportStats[0]?.inProgress || 0,
                urgentOpen: supportStats[0]?.urgentOpen || 0,
                oldestOpenAgeDays: oldestOpenTicketAgeDays,
                categoryBreakdown: supportCategoryBreakdown,
                regionBreakdown: supportRegionBreakdown,
                queue: supportQueue.map((ticket) => ({
                    _id: ticket._id,
                    subject: ticket.subject,
                    priority: ticket.priority,
                    status: ticket.status,
                    institution: ticket.institution,
                    region: ticket.region,
                    requesterName: ticket.requester?.name || 'Unknown',
                    createdAt: ticket.createdAt,
                    updatedAt: ticket.updatedAt,
                    replyCount: ticket.replies?.length || 0,
                })),
            },
            auditSummary: {
                eventsLast7Days: auditEventCount,
                destructiveEventsLast7Days: deleteEventCount,
                authEventsLast7Days: authEventCount,
                statusChangesLast7Days: statusChangeEventCount,
                topActors,
                recentSensitiveEvents: recentSensitiveEvents.map((event) => ({
                    _id: event._id,
                    action: event.action,
                    entityType: event.entityType,
                    summary: event.summary,
                    actorName: event.actorName,
                    actorRole: event.actorRole,
                    institution: event.institution,
                    createdAt: event.createdAt,
                })),
            },
            dataQualityAlerts: {
                stalePendingLearners,
                placementsMissingSupervisor,
                pendingAttendanceSignOff,
                activePlacementsWithoutVisits: activePlacementsWithoutVisits[0]?.count || 0,
            },
            userGovernance: {
                inactiveUsers,
                pendingPasswordResets,
                institutionsWithoutActiveAdmins,
                privilegedUserAnomalies,
                roleBreakdown: Object.entries(roleBreakdownMap)
                    .map(([role, count]) => ({ role, count }))
                    .sort((a, b) => b.count - a.count),
            },
            deadlineRisk: {
                upcomingDeadlines,
                ...deadlineRisk,
            },
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});

// ==================== INDUSTRY PARTNERS ====================

router.get('/industry-partners', async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'RegionalAdmin') {
            filter.region = req.user.region;
        } else if (req.user.role === 'Admin' || req.user.role === 'Manager') {
            filter.linkedInstitutions = req.user.institution;
        }
        const partners = await IndustryPartner.find(filter).sort({ name: 1 });
        res.json(partners);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.get('/industry-partners/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.json([]);
        
        const filter = { name: { $regex: query, $options: 'i' } };
        // Optional: constrain query to user's region if they are RegionalAdmin/Admin
        if (req.user.role === 'RegionalAdmin' || req.user.role === 'Admin' || req.user.role === 'Manager') {
             if (req.user.region) {
                 filter.region = req.user.region;
             }
        }
        
        const partners = await IndustryPartner.find(filter).limit(10);
        res.json(partners);
    } catch (error) {
        res.status(500).json({ message: 'Search Error' });
    }
});

router.post('/industry-partners/:id/link', requireRole('Admin', 'Manager'), async (req, res) => {
    try {
        if (!req.user.institution) return res.status(400).json({ message: 'User has no assigned institution' });
        
        const partner = await IndustryPartner.findById(req.params.id);
        if (!partner) return res.status(404).json({ message: 'Partner not found' });
        
        if (!partner.linkedInstitutions.includes(req.user.institution)) {
            partner.linkedInstitutions.push(req.user.institution);
            await partner.save();
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'IndustryPartner',
                entityId: partner._id,
                summary: `Linked institution ${req.user.institution} to partner ${partner.name}`,
                metadata: { linkedInstitution: req.user.institution },
                changedFields: ['linkedInstitutions'],
                after: partner,
            });
        }
        res.json(partner);
    } catch (error) {
        res.status(500).json({ message: 'Error linking partner' });
    }
});

router.post('/industry-partners', requireRole('SuperAdmin', 'RegionalAdmin', 'Admin', 'Manager'), async (req, res) => {
    try {
        const newPartner = new IndustryPartner({
            ...req.body,
            addedBy: req.user._id
        });
        
        if (req.user.institution) {
            newPartner.linkedInstitutions = [req.user.institution];
        }
        
        await newPartner.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'IndustryPartner',
            entityId: newPartner._id,
            summary: `Created industry partner ${newPartner.name}`,
            after: newPartner,
        });
        res.status(201).json(newPartner);
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'Company name already exists! Please search and link the existing partner instead.' });
        res.status(500).json({ message: 'Error creating industry partner' });
    }
});

router.put('/industry-partners/:id', requireRole('SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const existingPartner = await IndustryPartner.findById(req.params.id);
        const updatedPartner = await IndustryPartner.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (updatedPartner && existingPartner) {
            await logAuditEvent({
                req,
                action: 'UPDATE',
                entityType: 'IndustryPartner',
                entityId: updatedPartner._id,
                summary: `Updated industry partner ${updatedPartner.name}`,
                before: existingPartner,
                after: updatedPartner,
            });
        }
        res.json(updatedPartner);
    } catch (error) {
        res.status(500).json({ message: 'Error updating partner' });
    }
});

router.delete('/industry-partners/:id', requireRole('SuperAdmin'), async (req, res) => {
    try {
        const deletedPartner = await IndustryPartner.findByIdAndDelete(req.params.id);
        if (deletedPartner) {
            await logAuditEvent({
                req,
                action: 'DELETE',
                entityType: 'IndustryPartner',
                entityId: deletedPartner._id,
                summary: `Deleted industry partner ${deletedPartner.name}`,
                before: deletedPartner,
            });
        }
        res.json({ message: 'Industry partner deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting partner' });
    }
});

// ==================== PARTNER PORTAL ====================

router.post('/industry-partners/:id/create-account', requireRole('SuperAdmin', 'RegionalAdmin'), async (req, res) => {
    try {
        const partner = await IndustryPartner.findById(req.params.id);
        if (!partner) return res.status(404).json({ message: 'Partner not found' });
        if (!partner.contactEmail) return res.status(400).json({ message: 'Partner has no contact email' });

        const existingUser = await User.findOne({ email: partner.contactEmail });
        if (existingUser) {
            return res.status(400).json({ message: 'Account already exists for this email' });
        }

        const defaultPassword = 'Partner123!';
        const newUser = new User({
            name: partner.contactPerson,
            email: partner.contactEmail,
            password: defaultPassword,
            role: 'IndustryPartner',
            phone: partner.contactPhone,
            institution: 'N/A',
            partnerId: partner._id
        });

        await newUser.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'User',
            entityId: newUser._id,
            summary: `Created partner portal account for ${partner.name}`,
            after: newUser,
            metadata: { partnerId: partner._id },
        });
        res.json({ message: 'Account created successfully', defaultPassword });
    } catch (error) {
        res.status(500).json({ message: 'Error creating partner account', error: error.message });
    }
});

router.get('/partner-portal/placements', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const placements = await Placement.find({ partner: req.user.partnerId })
            .populate('learner')
            .sort({ startDate: -1 });
        res.json(placements);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching partner placements' });
    }
});

router.post('/partner-portal/evaluations', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const newEval = new EmployerEvaluation({
            ...req.body,
            partner: req.user.partnerId,
        });
        await newEval.save();
        await logAuditEvent({
            req,
            action: 'CREATE',
            entityType: 'EmployerEvaluation',
            entityId: newEval._id,
            summary: `Created employer evaluation ${newEval._id}`,
            after: newEval,
        });
        res.status(201).json(newEval);
    } catch (error) {
        res.status(500).json({ message: 'Error saving evaluation', error: error.message });
    }
});

router.get('/partner-portal/evaluations', requireRole('IndustryPartner'), async (req, res) => {
    try {
        const evals = await EmployerEvaluation.find({ partner: req.user.partnerId })
            .populate('learner')
            .sort({ evaluationDate: -1 });
        res.json(evals);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching evaluations' });
    }
});

// Admin endpoint to view evaluations for a specific learner
router.get('/evaluations/learner/:learnerId', async (req, res) => {
    try {
        const evals = await EmployerEvaluation.find({ learner: req.params.learnerId })
            .populate('partner')
            .sort({ evaluationDate: -1 });
        res.json(evals);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching evaluations' });
    }
});

// ==================== PLACEMENT REQUESTS ====================

router.get('/placement-requests', async (req, res) => {
    try {
        const filter = await getFilter(req.user);
        const requests = await PlacementRequest.find(filter)
            .populate('partner', 'name sector region totalSlots usedSlots')
            .populate('learners', 'firstName lastName trackingId')
            .populate('submittedBy', 'name')
            .sort({ createdAt: -1 });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/placement-requests', async (req, res) => {
    try {
        const { partner, learners, program, requestedSlots, startDate, endDate } = req.body;
        
        // Prevent requesting more slots than available
        const partnerDoc = await IndustryPartner.findById(partner);
        if (!partnerDoc) return res.status(404).json({ message: 'Partner not found' });
        if (partnerDoc.totalSlots - partnerDoc.usedSlots < requestedSlots) {
            return res.status(400).json({ message: 'Requested slots exceed available capacity' });
        }

        // Check capacity again to be safe
        const pDoc = await IndustryPartner.findById(partner);
        if (pDoc.totalSlots - pDoc.usedSlots < requestedSlots) {
            return res.status(400).json({ message: 'Partner no longer has enough capacity' });
        }

        try {
            const newRequest = new PlacementRequest({
                institution: req.user.institution,
                partner,
                learners,
                program,
                requestedSlots,
                startDate,
                endDate,
                submittedBy: req.user._id,
                status: 'Placed'
            });
            await newRequest.save();
            await logAuditEvent({
                req,
                action: 'CREATE',
                entityType: 'PlacementRequest',
                entityId: newRequest._id,
                summary: `Processed placement request for ${requestedSlots} learner(s)`,
                after: newRequest,
            });

            // Update partner slot capacity
            await IndustryPartner.findByIdAndUpdate(partner, {
                $inc: { usedSlots: requestedSlots }
            });

            // Create Placements for each learner and update learner status
            const placementDocs = learners.map(learnerId => ({
                learner: learnerId,
                companyName: partnerDoc.name,
                partner: partnerDoc._id,
                startDate,
                endDate,
                sector: partnerDoc.sector,
                location: partnerDoc.location || partnerDoc.region,
                institution: req.user.institution,
                status: 'Active'
            }));

            const createdPlacements = await Placement.insertMany(placementDocs);

            // Update each learner's status and placement ref
            for (const placement of createdPlacements) {
                await Learner.findByIdAndUpdate(placement.learner, {
                    status: 'Placed',
                    placement: placement._id
                });
            }

            await logAuditEvent({
                req,
                action: 'CREATE',
                entityType: 'Placement',
                entityId: createdPlacements.map((placement) => placement._id).join(','),
                summary: `Created ${createdPlacements.length} placement(s) from approved partner request`,
                metadata: { placementRequestId: newRequest._id, learnerCount: createdPlacements.length },
                after: createdPlacements,
            });

            // Notify Institution
            const firstLearner = await Learner.findById(learners[0]);
            const learnerName = firstLearner ? firstLearner.name : 'Multiple Learners';
            const trackingId = firstLearner ? firstLearner.trackingId : 'N/A';
            
            notifyInstitutionAdmins(req.user.institution, sendPlacementApprovalEmail, learnerName, partnerDoc.name, trackingId);

            notifyUsers({
                partnerId: partnerDoc._id,
                sender: req.user._id,
                type: 'placement',
                title: 'New Learners Placed',
                message: `${requestedSlots} new learners from ${req.user.institution} have been officially placed with your organization.`,
                link: '/partner-dashboard'
            });

            res.status(201).json(newRequest);
        } catch (err) {
            return res.status(400).json({ message: err.message });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error processing placement' });
    }
});


export default router;
