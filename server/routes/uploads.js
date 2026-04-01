import express from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import { Document } from '../models/Document.js';
import { Learner } from '../models/Learner.js';
import { User } from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { logAuditEvent } from '../utils/audit.js';

const router = express.Router();

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

// All routes require auth
router.use(auth);

// ==================== PROFILE PICTURE ====================
router.post('/profile-picture/:learnerId', imageUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    const learner = await Learner.findById(req.params.learnerId);
    if (!learner) return res.status(404).json({ message: 'Learner not found' });

    // Delete previous profile picture from Cloudinary if it exists
    if (learner.profilePicture) {
      try {
        // Extract public_id from the URL
        const urlParts = learner.profilePicture.split('/');
        const folder = urlParts.slice(-2, -1)[0];
        const fileNameWithExt = urlParts.slice(-1)[0];
        const fileName = fileNameWithExt.split('.')[0];
        const publicId = `${folder}/${fileName}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.warn('Could not delete old profile picture:', e);
      }
    }

    // Upload new profile picture to Cloudinary
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

    // Update learner with new profile picture URL
    const before = learner.toObject();
    learner.profilePicture = result.secure_url;
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

    res.json({ url: result.secure_url });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
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

    // Delete previous profile picture from Cloudinary if it exists
    if (user.profilePicture) {
      try {
        const urlParts = user.profilePicture.split('/');
        const folder = urlParts.slice(-2, -1)[0];
        const fileNameWithExt = urlParts.slice(-1)[0];
        const fileName = fileNameWithExt.split('.')[0];
        const publicId = `${folder}/${fileName}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.warn('Could not delete old profile picture:', e);
      }
    }

    // Upload new profile picture to Cloudinary
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

    // Update user — use updateOne to avoid triggering password rehash
    await User.updateOne({ _id: req.user._id }, { profilePicture: result.secure_url });
    await logAuditEvent({
      req,
      action: 'UPLOAD',
      entityType: 'UserProfilePicture',
      entityId: req.user._id,
      summary: `Updated profile picture for user ${req.user.name}`,
      metadata: { profilePicture: result.secure_url },
      changedFields: ['profilePicture'],
    });

    res.json({ url: result.secure_url });
  } catch (error) {
    console.error('User profile picture upload error:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});

// ==================== UPLOAD ====================
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { category, learnerId, placementId, monitoringVisitId } = req.body;

    // Stream the buffer to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `gtvet-wel/${req.user.institution || 'general'}`,
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
      institution: req.user.institution || 'N/A',
    });

    await doc.save();
    await doc.populate('uploadedBy', 'name');

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
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});

// ==================== GET DOCUMENTS ====================
router.get('/', async (req, res) => {
  try {
    const filter = {};

    if (req.query.learnerId) filter.learner = req.query.learnerId;
    if (req.query.placementId) filter.placement = req.query.placementId;
    if (req.query.monitoringVisitId) filter.monitoringVisit = req.query.monitoringVisitId;

    // Non-super admins can only see their institution's documents
    if (req.user.role !== 'SuperAdmin' && req.user.role !== 'RegionalAdmin') {
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
    const isAdmin = ['Admin', 'SuperAdmin'].includes(req.user.role);
    if (!isOwner && !isAdmin) {
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
