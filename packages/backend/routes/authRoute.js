// routes/auth.js
const express = require('express');
const { body } = require('express-validator');
const passport = require('../config/passport');
const authController = require('../controller/authController');
const { loginRateLimit, registerRateLimit, forgotPasswordRateLimit } = require('../middlewares/rateLimiter');
const { authenticateToken, requireAdmin, requireStaff } = require('../middlewares/auth');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('firstName').trim().isLength({ min: 2, max: 50 }),
  body('lastName').trim().isLength({ min: 2, max: 50 })
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

// Auth routes
router.post('/register', registerRateLimit, registerValidation, authController.register);
router.post('/login', loginRateLimit, loginValidation, authController.login);
router.post('/forgot-password', forgotPasswordRateLimit, [body('email').isEmail()], authController.forgotPassword);
router.post('/forgot-account', forgotPasswordRateLimit, [body('identifier').notEmpty()], authController.forgotAccount);
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
], authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/logout', authController.logout);
router.post('/refresh-token', authController.refreshToken);

// OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google'), (req, res) => {
  // Generate JWT tokens
  const { accessToken, refreshToken } = require('../utils/jwt').generateTokens({ userId: req.user.id });
  res.redirect(`${process.env.FRONTEND_URL}/login/success?token=${accessToken}&refresh=${refreshToken}`);
});

router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get('/facebook/callback', passport.authenticate('facebook'), (req, res) => {
  // Generate JWT tokens
  const { accessToken, refreshToken } = require('../utils/jwt').generateTokens({ userId: req.user.id });
  res.redirect(`${process.env.FRONTEND_URL}/login/success?token=${accessToken}&refresh=${refreshToken}`);
});

// Protected routes
router.get('/profile', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Admin routes
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const skip = (page - 1) * limit;
    
    const where = {};
    
    if (role && ['ADMIN', 'CASHIER', 'CUSTOMER'].includes(role)) {
      where.role = role;
    }
    
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          isEmailVerified: true,
          lastLogin: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);
    
    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['ADMIN', 'CASHIER', 'CUSTOMER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        email: true,
        username: true,
        role: true
      }
    });
    
    res.json({ message: 'User role updated successfully', user });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own status' });
    }
    
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: Boolean(isActive) },
      select: {
        id: true,
        email: true,
        username: true,
        isActive: true
      }
    });
    
    // Invalidate all sessions if deactivating user
    if (!isActive) {
      await prisma.session.deleteMany({
        where: { userId: id }
      });
    }
    
    res.json({ message: 'User status updated successfully', user });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Staff routes (Admin + Cashier)
router.get('/dashboard/stats', authenticateToken, requireStaff, async (req, res) => {
  try {
    const [totalUsers, activeUsers, todayLogins, totalSessions] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.loginAttempt.count({
        where: {
          success: true,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      prisma.session.count({
        where: {
          expiresAt: {
            gte: new Date()
          }
        }
      })
    ]);
    
    res.json({
      totalUsers,
      activeUsers,
      todayLogins,
      activeSessions: totalSessions
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;