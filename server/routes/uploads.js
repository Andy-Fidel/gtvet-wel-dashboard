import express from 'express';
import multer from 'multer';
import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Document } from '../models/Document.js';
import { Learner } from '../models/Learner.js';
import { User } from '../models/User.js';
import { Placement } from '../models/Placement.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { EmployerEvaluation } from '../models/EmployerEvaluation.js';
import { MonitoringVisit } from '../models/MonitoringVisit.js';
import { auth } from '../middleware/auth.js';
import { logAuditEvent } from '../utils/audit.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localUploadRoot = path.resolve(__dirname, '../local-uploads');
const canManageInstitutionRecord = (user, institution) => {
  if (!institution) return false;
  if (user.role === 'SuperAdmin') return true;
  if (user.role === 'RegionalAdmin') return true;
  return user.institution === institution;
};

const getUserPartnerId = (user) => user?.partnerId?._id?.toString?.() || user?.partnerId?.toString?.() || null;

const canAccessLearner = (user, learner) => {
  if (!learner) return false;
  if (user.role === 'SuperAdmin' || user.role === 'RegionalAdmin') return true;
  if (user.role === 'Guardian') {
    return (user.linkedLearners || []).some((linkedLearner) => linkedLearner._id?.toString?.() === learner._id.toString());
  }
  if (user.role === 'IndustryPartner') return false;
  if (learner.owner?.toString?.() === user._id.toString()) return true;
  return learner.institution === user.institution;
};

const canAccessPlacement = (user, placement) => {
  if (!placement) return false;
  if (user.role === 'SuperAdmin' || user.role === 'RegionalAdmin') return true;
  if (user.role === 'IndustryPartner') {
    const userPartnerId = getUserPartnerId(user);
    const placementPartnerId = placement.partner?.toString?.();
    if (!userPartnerId || !placementPartnerId || userPartnerId !== placementPartnerId) return false;
    if (!placement.partnerSupervisor) return true;
    return placement.partnerSupervisor.toString() === user._id.toString();
  }
  if (placement.delegate?.toString?.() === user._id.toString()) return true;
  if (placement.owner?.toString?.() === user._id.toString()) return true;
  return placement.institution === user.institution;
};

const canAccessSupportTicket = (user, ticket) => {
  if (!ticket) return false;
  if (user.role === 'SuperAdmin' || user.role === 'RegionalAdmin') return true;
  if (user.role === 'IndustryPartner') {
    return ticket.partnerId?.toString?.() === getUserPartnerId(user);
  }
  if (user.role === 'Guardian') {
    return ticket.requester?.toString?.() === user._id.toString();
  }
  if (ticket.requester?.toString?.() === user._id.toString()) return true;
  return ticket.institution === user.institution;
};

const canAccessMonitoringVisit = (user, visit) => {
  if (!visit) return false;
  if (user.role === 'SuperAdmin' || user.role === 'RegionalAdmin') return true;
  if (visit.submittedBy?.toString?.() === user._id.toString()) return true;
  return visit.institution === user.institution;
};

const canAccessEmployerEvaluation = async (user, evaluation) => {
  if (!evaluation) return false;
  if (user.role === 'SuperAdmin' || user.role === 'RegionalAdmin') return true;
  if (user.role === 'IndustryPartner') {
    return evaluation.partner?.toString?.() === getUserPartnerId(user);
  }
  const learner = await Learner.findById(evaluation.learner).select('institution owner');
  return canAccessLearner(user, learner);
};

const ensureDirectory = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const sanitizeBaseName = (value) => value.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();

const getFileExtension = (file) => {
  const fromName = path.extname(file.originalname || '').toLowerCase();
  if (fromName) return fromName;
  const mimeMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return mimeMap[file.mimetype] || '.bin';
};

const saveLocalProfileImage = async ({ file, folder, prefix }) => {
  const directory = path.join(localUploadRoot, folder);
  await ensureDirectory(directory);
  const fileName = `${sanitizeBaseName(prefix)}-${crypto.randomBytes(8).toString('hex')}${getFileExtension(file)}`;
  const filePath = path.join(directory, fileName);
  await fs.writeFile(filePath, file.buffer);
  return {
    fileName,
    filePath,
    url: `/api/documents/local-file/${folder}/${fileName}`,
  };
};

const deleteLocalProfileImage = async (url) => {
  if (!url?.startsWith('/api/documents/local-file/')) return;
  const relativePath = url.replace('/api/documents/local-file/', '');
  const targetPath = path.join(localUploadRoot, relativePath);
  await fs.unlink(targetPath).catch(() => {});
};

// Multer for images only (profile pictures)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for profile pics
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for profile pictures.'));
    }
  },
});

// Multer config: store in memory buffer, max 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported. Please upload images, PDFs, or Word documents.'));
    }
  },
});

router.get('/local-file/:folder/:fileName', async (req, res) => {
  try {
    const folder = req.params.folder;
    const fileName = req.params.fileName;
    if (!['profile-pictures', 'user-avatars'].includes(folder)) {
      return res.status(404).json({ message: 'File not found' });
    }

    const resolvedPath = path.join(localUploadRoot, folder, fileName);
    if (!resolvedPath.startsWith(path.join(localUploadRoot, folder))) {
      return res.status(400).json({ message: 'Invalid file path' });
    }

    res.sendFile(resolvedPath, (error) => {
      if (error) {
        if (!res.headersSent) {
          res.status(error.statusCode || 404).json({ message: 'File not found' });
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error loading local file' });
  }
});

// All routes below require auth
router.use(auth);

// ==================== PROFILE PICTURE ====================
router.post('/profile-picture/:learnerId', imageUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    const learner = await Learner.findById(req.params.learnerId).select('profilePicture institution owner name');
    if (!learner) return res.status(404).json({ message: 'Learner not found' });
    if (!canAccessLearner(req.user, learner)) {
      return res.status(403).json({ message: 'Not authorized to update this learner profile picture' });
    }

    // Delete previous profile picture if it exists
    if (learner.profilePicture) {
      try {
        if (learner.profilePicture.startsWith('/api/documents/local-file/')) {
          await deleteLocalProfileImage(learner.profilePicture);
        } else if (isCloudinaryConfigured()) {
          const urlParts = learner.profilePicture.split('/');
          const folder = urlParts.slice(-2, -1)[0];
          const fileNameWithExt = urlParts.slice(-1)[0];
          const fileName = fileNameWithExt.split('.')[0];
          const publicId = `${folder}/${fileName}`;
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (e) {
        console.warn('Could not delete old profile picture:', e);
      }
    }

    let profilePictureUrl = '';
    if (isCloudinaryConfigured()) {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'gtvet-wel/profile-pictures',
            resource_type: 'image',
            transformation: [
              { width: 400, height: 400, crop: 'fill', gravity: 'face' }
            ],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      profilePictureUrl = result.secure_url;
    } else {
      const localFile = await saveLocalProfileImage({
        file: req.file,
        folder: 'profile-pictures',
        prefix: learner._id.toString(),
      });
      profilePictureUrl = localFile.url;
    }

    // Update learner with new profile picture URL
    const before = learner.toObject();
    learner.profilePicture = profilePictureUrl;
    await learner.save();

    await logAuditEvent({
      req,
      action: 'UPLOAD',
      entityType: 'LearnerProfilePicture',
      entityId: learner._id,
      summary: `Updated profile picture for learner ${learner.name}`,
      before,
      after: learner,
      changedFields: ['profilePicture'],
    });

    res.json({ url: profilePictureUrl, storage: isCloudinaryConfigured() ? 'cloudinary' : 'local' });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({ message: error.message || 'Upload failed' });
  }
});

// ==================== USER PROFILE PICTURE ====================
router.post('/user-profile-picture', imageUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Delete previous profile picture if it exists
    if (user.profilePicture) {
      try {
        if (user.profilePicture.startsWith('/api/documents/local-file/')) {
          await deleteLocalProfileImage(user.profilePicture);
        } else if (isCloudinaryConfigured()) {
          const urlParts = user.profilePicture.split('/');
          const folder = urlParts.slice(-2, -1)[0];
          const fileNameWithExt = urlParts.slice(-1)[0];
          const fileName = fileNameWithExt.split('.')[0];
          const publicId = `${folder}/${fileName}`;
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (e) {
        console.warn('Could not delete old profile picture:', e);
      }
    }

    let profilePictureUrl = '';
    if (isCloudinaryConfigured()) {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'gtvet-wel/user-avatars',
            resource_type: 'image',
            transformation: [
              { width: 400, height: 400, crop: 'fill', gravity: 'face' }
            ],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      profilePictureUrl = result.secure_url;
    } else {
      const localFile = await saveLocalProfileImage({
        file: req.file,
        folder: 'user-avatars',
        prefix: user._id.toString(),
      });
      profilePictureUrl = localFile.url;
    }

    // Update user — use updateOne to avoid triggering password rehash
    await User.updateOne({ _id: req.user._id }, { profilePicture: profilePictureUrl });
    await logAuditEvent({
      req,
      action: 'UPLOAD',
      entityType: 'UserProfilePicture',
      entityId: req.user._id,
      summary: `Updated profile picture for user ${req.user.name}`,
      metadata: { profilePicture: profilePictureUrl },
      changedFields: ['profilePicture'],
    });

    res.json({ url: profilePictureUrl, storage: isCloudinaryConfigured() ? 'cloudinary' : 'local' });
  } catch (error) {
    console.error('User profile picture upload error:', error);
    res.status(500).json({ message: error.message || 'Upload failed' });
  }
});

// ==================== UPLOAD ====================
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(500).json({ message: 'Document uploads are unavailable because Cloudinary is not configured on the server' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { category, learnerId, placementId, monitoringVisitId, supportTicketId, employerEvaluationId } = req.body;
    let institution = req.user.institution || 'N/A';
    let partnerId = req.user.partnerId?._id || req.user.partnerId || undefined;

    if (learnerId) {
      const learner = await Learner.findById(learnerId).select('institution owner');
      if (!learner) return res.status(404).json({ message: 'Learner not found' });
      if (!canAccessLearner(req.user, learner)) {
        return res.status(403).json({ message: 'Not authorized to upload documents for this learner' });
      }
      if (learner?.institution) institution = learner.institution;
    }

    if (placementId) {
      const placement = await Placement.findById(placementId).select('institution partner owner delegate partnerSupervisor');
      if (!placement) return res.status(404).json({ message: 'Placement not found' });
      if (!canAccessPlacement(req.user, placement)) {
        return res.status(403).json({ message: 'Not authorized to upload documents for this placement' });
      }
      if (placement.institution) institution = placement.institution;
      if (placement.partner) partnerId = placement.partner;
    }

    if (monitoringVisitId) {
      const visit = await MonitoringVisit.findById(monitoringVisitId).select('institution submittedBy');
      if (!visit) return res.status(404).json({ message: 'Monitoring visit not found' });
      if (!canAccessMonitoringVisit(req.user, visit)) {
        return res.status(403).json({ message: 'Not authorized to upload documents for this monitoring visit' });
      }
      if (visit.institution) institution = visit.institution;
    }

    if (supportTicketId) {
      const ticket = await SupportTicket.findById(supportTicketId).select('institution partnerId requester');
      if (!ticket) return res.status(404).json({ message: 'Support ticket not found' });
      if (!canAccessSupportTicket(req.user, ticket)) {
        return res.status(403).json({ message: 'Not authorized to upload documents for this support ticket' });
      }
      if (ticket.institution) institution = ticket.institution;
      if (ticket.partnerId) partnerId = ticket.partnerId;
    }

    if (employerEvaluationId) {
      const evaluation = await EmployerEvaluation.findById(employerEvaluationId).select('partner learner');
      if (!evaluation) return res.status(404).json({ message: 'Employer evaluation not found' });
      if (!(await canAccessEmployerEvaluation(req.user, evaluation))) {
        return res.status(403).json({ message: 'Not authorized to upload documents for this employer evaluation' });
      }
      if (evaluation.partner) partnerId = evaluation.partner;
      if (evaluation.learner) {
        const learner = await Learner.findById(evaluation.learner).select('institution');
        if (learner?.institution) institution = learner.institution;
      }
    }

    // Stream the buffer to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `gtvet-wel/${institution || 'general'}`,
          resource_type: 'auto',
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx'],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Save metadata to MongoDB
    const doc = new Document({
      url: result.secure_url,
      publicId: result.public_id,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      category: category || 'Other',
      uploadedBy: req.user._id,
      learner: learnerId || undefined,
      placement: placementId || undefined,
      monitoringVisit: monitoringVisitId || undefined,
      supportTicket: supportTicketId || undefined,
      employerEvaluation: employerEvaluationId || undefined,
      institution,
      partnerId,
    });

    await doc.save();
    await doc.populate('uploadedBy', 'name');

    if (supportTicketId) {
      await SupportTicket.findByIdAndUpdate(supportTicketId, {
        lastActivityBy: req.user._id,
        lastActivityAt: new Date(),
      });
    }

    await logAuditEvent({
      req,
      action: 'UPLOAD',
      entityType: 'Document',
      entityId: doc._id,
      summary: `Uploaded document ${doc.fileName}`,
      after: doc,
    });

    res.status(201).json(doc);
  } catch (error) {
    console.error('Upload error:', error);
    if (error.message?.includes('File type not supported')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Upload failed' });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File is too large for this upload type' });
    }
    return res.status(400).json({ message: error.message });
  }

  if (error) {
    return res.status(400).json({ message: error.message || 'Upload request failed' });
  }

  next();
});

// ==================== GET DOCUMENTS ====================
router.get('/', async (req, res) => {
  try {
    const filter = {};

    if (req.query.learnerId) filter.learner = req.query.learnerId;
    if (req.query.placementId) filter.placement = req.query.placementId;
    if (req.query.monitoringVisitId) filter.monitoringVisit = req.query.monitoringVisitId;
    if (req.query.supportTicketId) filter.supportTicket = req.query.supportTicketId;
    if (req.query.employerEvaluationId) filter.employerEvaluation = req.query.employerEvaluationId;

    // Non-super admins can only see their institution's documents
    if (req.user.role === 'IndustryPartner') {
      filter.partnerId = req.user.partnerId?._id || req.user.partnerId;
    } else if (req.user.role !== 'SuperAdmin' && req.user.role !== 'RegionalAdmin') {
      filter.institution = req.user.institution;
    }

    const documents = await Document.find(filter)
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(documents);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching documents' });
  }
});

// ==================== DELETE DOCUMENT ====================
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    // Only the uploader, Admin, or SuperAdmin can delete
    const isOwner = doc.uploadedBy.toString() === req.user._id.toString();
    const isSuperAdmin = req.user.role === 'SuperAdmin';
    const isRegionalAdmin = req.user.role === 'RegionalAdmin';
    const isInstitutionAdmin = req.user.role === 'Admin' && canManageInstitutionRecord(req.user, doc.institution);
    const isPartnerScoped = req.user.role === 'IndustryPartner' && doc.partnerId?.toString?.() === getUserPartnerId(req.user);
    if (!isOwner && !isSuperAdmin && !isRegionalAdmin && !isInstitutionAdmin && !isPartnerScoped) {
      return res.status(403).json({ message: 'Not authorized to delete this document' });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(doc.publicId, { resource_type: 'raw' });
    // Also try image resource type in case it was uploaded as image
    await cloudinary.uploader.destroy(doc.publicId).catch(() => {});

    // Delete from MongoDB
    await Document.findByIdAndDelete(req.params.id);

    await logAuditEvent({
      req,
      action: 'DELETE',
      entityType: 'Document',
      entityId: doc._id,
      summary: `Deleted document ${doc.fileName}`,
      before: doc,
    });

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Error deleting document' });
  }
});

export default router;
