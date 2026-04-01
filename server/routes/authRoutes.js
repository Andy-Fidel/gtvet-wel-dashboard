import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { auth, JWT_SECRET } from '../middleware/auth.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';
import { logAuditEvent } from '../utils/audit.js';

const router = express.Router();

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

    // Generate token
    const token = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: '7d' });

    const populatedUser = await User.findById(newUser._id).populate('partnerId');
    res.status(201).json({
      token,
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

    const user = await User.findOne({ email }).populate('partnerId');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.status !== 'Active') {
      return res.status(401).json({ message: 'Account is inactive. Contact your administrator.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
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
  const user = await User.findById(req.user._id).populate('partnerId');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user.toJSON());
});

// POST /api/auth/change-password
router.post('/change-password', auth, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.password = newPassword;
    user.passwordChangeRequired = false;
    await user.save();

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
