import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { auth, JWT_SECRET, clearSessionCookies, issueCsrfToken, setSessionCookies } from '../middleware/auth.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';
import { logAuditEvent } from '../utils/audit.js';
import { createAuthSession } from '../utils/authSessions.js';
import { AuthSession } from '../models/AuthSession.js';
import securityRoutes from './securityRoutes.js';
import { MfaCredential } from '../models/MfaCredential.js';
import { consumeMfaCode } from '../utils/mfa.js';
import inspectionRoutes from './inspectionRoutes.js';

const router = express.Router();
router.use('/inspection', inspectionRoutes);
router.use('/security', securityRoutes);

async function issueSession(user, req, res, mfaVerified = false) {
  const session = await createAuthSession(user, req, mfaVerified);
  const token = jwt.sign({ userId: user._id, sid: String(session._id) }, JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
  setSessionCookies(res, token);
}

router.get('/csrf', (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  const csrfToken = issueCsrfToken(res);
  res.json({ csrfToken });
});

// POST /api/auth/register (SuperAdmin only - used to create initial Institution Admins)
router.post('/register', auth, (req, res, next) => {
  if (req.user.role !== 'SuperAdmin') {
    return res.status(403).json({ message: 'Only SuperAdmins can register new admins' });
  }
  next();
}, async (req, res) => {
  try {
    const { name, email, password, institution, role, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const newUser = new User({
      name,
      email,
      password,
      institution,
      role: role || 'Staff',
      phone,
    });

    await newUser.save();
    await logAuditEvent({
      req,
      action: 'CREATE',
      entityType: 'User',
      entityId: newUser._id,
      summary: `Registered user ${newUser.name}`,
      after: newUser,
    });

    // Creating an account must not replace the administrator's own session.

    const populatedUser = await User.findById(newUser._id)
      .populate('partnerId')
      .populate('linkedLearners', 'name trackingId');
    res.status(201).json({
      user: populatedUser.toJSON(),
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering user' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+sessionVersion')
      .populate('partnerId')
      .populate('linkedLearners', 'name trackingId');
    if (!user) {
      await logAuditEvent({
        req,
        action: 'AUTH',
        entityType: 'AuthSession',
        entityId: email || 'unknown',
        summary: `Failed login attempt for ${email || 'unknown email'}`,
        metadata: {
          outcome: 'FAILED',
          email,
          actorName: email || 'Unknown User',
          actorRole: 'Unknown',
          institution: 'N/A',
          reason: 'User not found',
        },
      });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.status !== 'Active') {
      await logAuditEvent({
        req,
        action: 'AUTH',
        entityType: 'AuthSession',
        entityId: user._id,
        summary: `Blocked login for inactive user ${user.email}`,
        metadata: {
          outcome: 'FAILED',
          email: user.email,
          actorName: user.name,
          actorRole: user.role,
          institution: user.institution || 'N/A',
          region: user.region || '',
          reason: 'Inactive account',
        },
      });
      return res.status(401).json({ message: 'Account is inactive. Contact your administrator.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await logAuditEvent({
        req,
        action: 'AUTH',
        entityType: 'AuthSession',
        entityId: user._id,
        summary: `Failed login attempt for ${user.email}`,
        metadata: {
          outcome: 'FAILED',
          email: user.email,
          actorName: user.name,
          actorRole: user.role,
          institution: user.institution || 'N/A',
          region: user.region || '',
          reason: 'Invalid password',
        },
      });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const mfa = await MfaCredential.exists({ userId: user._id, enabled: true });
    const mfaCode = String(req.body.mfaCode || '').trim();
    if (mfa && !mfaCode) {
      return res.status(202).json({
        mfaRequired: true,
        message: 'Enter your authenticator or recovery code to continue.',
      });
    }
    if (mfa && !(await consumeMfaCode(user._id, mfaCode))) {
      await logAuditEvent({ req, actor: user, action: 'AUTH', entityType: 'AuthSession', entityId: user._id, summary: 'MFA verification failed', metadata: { outcome: 'FAILED' } });
      return res.status(401).json({ message: 'Enter a valid authenticator or recovery code. After repeated failures, wait 10 minutes.' });
    }
    user.lastLoginAt = new Date();
    await user.save();
    await issueSession(user, req, res, Boolean(mfa));

    await logAuditEvent({
      req,
      actor: user,
      action: 'AUTH',
      entityType: 'AuthSession',
      entityId: user._id,
      summary: `Successful login for ${user.email}`,
      metadata: { outcome: 'SUCCESS', email: user.email },
    });

    res.json({
      user: user.toJSON(),
      passwordChangeRequired: user.passwordChangeRequired || false,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('partnerId')
    .populate('linkedLearners', 'name trackingId');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.set('Cache-Control', 'no-store').json({ ...user.toJSON(), ...(req.inspectionActor ? {
    passwordChangeRequired: false,
    inspection: { readOnly: true, actorName: req.inspectionActor.name, expiresAt: req.authSession.expiresAt },
  } : {}) });
});

router.post('/logout', auth, async (req, res) => {
  await AuthSession.updateOne({ _id: req.authSession._id }, { $set: { revokedAt: new Date(), reason: 'Logout' } });
  await logAuditEvent({ req, action: 'AUTH', entityType: 'AuthSession', entityId: req.authSession._id, summary: 'Logged out; session revoked' });
  clearSessionCookies(res);
  res.json({ message: 'Logged out successfully' });
});

// POST /api/auth/change-password
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id).select('+sessionVersion');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Require current password for voluntary changes (not first-time forced changes)
    if (!user.passwordChangeRequired) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required' });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }
    }

    user.password = newPassword;
    user.passwordChangeRequired = false;
    if (!user.inviteAcceptedAt) {
      user.inviteAcceptedAt = new Date();
    }
    await user.save();

    await AuthSession.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date(), reason: 'Password changed' } });
    await issueSession(user, req, res, req.authSession.mfaVerified);

    await logAuditEvent({
      req,
      action: 'AUTH',
      entityType: 'User',
      entityId: user._id,
      summary: `Changed password for ${user.name}`,
      metadata: { passwordChangeRequired: false },
      changedFields: ['password', 'passwordChangeRequired'],
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // For security, always return success even if email not found
    if (!user) {
      return res.json({ message: 'If that email exists, a link has been sent.' });
    }

    // Generate token
    const resetToken = crypto.randomBytes(20).toString('hex');
    
    // Hash token and set expiration (1 hr)
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    // Create reset URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    await sendPasswordResetEmail(user.email, resetUrl);

    res.json({ message: 'If that email exists, a link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error processing forgot password request' });
  }
});

// PUT /api/auth/reset-password/:token
router.put('/reset-password/:token', async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    // Hash the raw token from URL to match database
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Set new password (it will be hashed by pre-save hook)
    user.password = newPassword;
    user.passwordChangeRequired = false;
    if (!user.inviteAcceptedAt) {
      user.inviteAcceptedAt = new Date();
    }
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    await logAuditEvent({
      actor: user,
      action: 'AUTH',
      entityType: 'User',
      entityId: user._id,
      summary: `Reset password for ${user.name}`,
      metadata: { passwordReset: true },
      changedFields: ['password', 'passwordChangeRequired', 'resetPasswordToken', 'resetPasswordExpires'],
    });

    res.json({ message: 'Password has been fully reset successfully.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

export default router;
