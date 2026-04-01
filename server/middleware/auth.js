import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error("CRITICAL ERROR: JWT_SECRET environment variable is not defined in production.");
    process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET || 'gtvet-wel-secret-key-change-in-production';

// Verify JWT token and attach user to request
export const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId).populate('partnerId');
    if (!user || user.status !== 'Active') {
      return res.status(401).json({ message: 'Invalid token or inactive user' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token verification failed' });
  }
};

// Role-based access control middleware
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
};

export { JWT_SECRET };
