
// middleware/auth.js
const { verifyToken } = require('../utils/jwt');
const { prisma } = require('../config/database');
const redis = require('../config/redis');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`blacklist_${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token is invalid' });
    }
    
    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { 
        id: true, 
        email: true, 
        username: true, 
        role: true, 
        isActive: true,
        firstName: true,
        lastName: true 
      }
    });
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based authorization middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!userRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: userRoles,
        current: req.user.role
      });
    }
    
    next();
  };
};

// Check if user is admin
const requireAdmin = requireRole('ADMIN');

// Check if user is admin or cashier
const requireStaff = requireRole(['ADMIN', 'CASHIER']);

module.exports = { 
  authenticateToken, 
  requireRole, 
  requireAdmin, 
  requireStaff 
};