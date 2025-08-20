// controllers/authController.js
const { prisma } = require('../config/database');
const redis = require('../config/redis');
const { hashPassword, verifyPassword } = require('../utils/password');
const { generateTokens, generateSecureToken } = require('../utils/jwt');
const { sendVerificationEmail, sendPasswordResetEmail, sendAccountRecoveryEmail } = require('../utils/email');
const { validationResult } = require('express-validator');

class AuthController {
  // Register
  async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { email, password, firstName, lastName, username } = req.body;
      
      // Check if user exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { username: username || undefined }
          ]
        }
      });
      
      if (existingUser) {
        return res.status(400).json({ 
          error: 'User with this email or username already exists' 
        });
      }
      
      // Hash password
      const hashedPassword = await hashPassword(password);
      
      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          username,
          role: 'CUSTOMER' // Default role
        }
      });
      
      // Generate email verification token
      const verificationToken = generateSecureToken();
      await prisma.emailVerification.create({
        data: {
          userId: user.id,
          token: verificationToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
      });
      
      // Send verification email
      await sendVerificationEmail(email, verificationToken);
      
      res.status(201).json({
        message: 'User registered successfully. Please check your email for verification.',
        user: {
          id: user.id,
          email: user.email,
          username: user.username
        }
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  // Login
  async login(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { email, password } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get('User-Agent');
      
      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          username: true,
          password: true,
          firstName: true,
          lastName: true,
          avatar: true,
          role: true,
          isActive: true,
          isEmailVerified: true
        }
      });
      
      // Log login attempt
      await prisma.loginAttempt.create({
        data: {
          userId: user?.id,
          email,
          ipAddress,
          userAgent,
          success: false
        }
      });
      
      if (!user || !user.password) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      if (!user.isActive) {
        return res.status(401).json({ error: 'Account is deactivated' });
      }
      
      // Verify password
      const isValidPassword = await verifyPassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Update login attempt as successful
      await prisma.loginAttempt.updateMany({
        where: {
          email,
          ipAddress,
          success: false,
          createdAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
          }
        },
        data: { success: true }
      });
      
      // Generate tokens
      const { accessToken, refreshToken } = generateTokens({ userId: user.id });
      
      // Store session
      await prisma.session.create({
        data: {
          userId: user.id,
          token: refreshToken,
          userAgent,
          ipAddress,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });
      
      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });
      
      // Cache user data in Redis
      await redis.setex(`user_${user.id}`, 3600, JSON.stringify({
        id: user.id,
        email: user.email,
        username: user.username
      }));
      
      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          role: user.role,
          isEmailVerified: user.isEmailVerified
        },
        accessToken,
        refreshToken
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  // Forgot Password
  async forgotPassword(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { email } = req.body;
      
      const user = await prisma.user.findUnique({
        where: { email }
      });
      
      if (!user) {
        // Don't reveal if user exists
        return res.json({ 
          message: 'If an account with that email exists, we sent a password reset link.' 
        });
      }
      
      // Generate reset token
      const resetToken = generateSecureToken();
      
      // Store reset token
      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          token: resetToken,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
        }
      });
      
      // Send reset email
      await sendPasswordResetEmail(email, resetToken);
      
      res.json({ 
        message: 'If an account with that email exists, we sent a password reset link.' 
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  // Forgot Account (Account Recovery)
  async forgotAccount(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { identifier } = req.body; // Could be email, username, or phone
      
      // Search user by multiple criteria
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: identifier },
            { username: identifier }
          ]
        }
      });
      
      if (!user) {
        // Don't reveal if account exists
        return res.json({ 
          message: 'If an account matches the provided information, we will send recovery instructions.' 
        });
      }
      
      // Send account recovery information
      const recoveryInfo = [];
      
      if (user.email) {
        const maskedEmail = user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        recoveryInfo.push(`Email: ${maskedEmail}`);
        
        // Generate recovery token
        const recoveryToken = generateSecureToken();
        
        await prisma.passwordReset.create({
          data: {
            userId: user.id,
            token: recoveryToken,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
          }
        });
        
        // Send recovery email
        await sendAccountRecoveryEmail(user.email, {
          username: user.username,
          email: user.email,
          recoveryToken
        });
      }
      
      res.json({ 
        message: 'Account recovery information has been sent.',
        recoveryHints: recoveryInfo
      });
    } catch (error) {
      console.error('Forgot account error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  async resetPassword(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { token, password } = req.body;
      
      const passwordReset = await prisma.passwordReset.findUnique({
        where: { token },
        include: { user: true }
      });
      
      if (!passwordReset || passwordReset.used || passwordReset.expiresAt < new Date()) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      
      // Hash new password
      const hashedPassword = await hashPassword(password);
      
      // Update password and mark token as used
      await prisma.$transaction([
        prisma.user.update({
          where: { id: passwordReset.userId },
          data: { password: hashedPassword }
        }),
        prisma.passwordReset.update({
          where: { id: passwordReset.id },
          data: { used: true }
        }),
        // Invalidate all sessions for this user
        prisma.session.deleteMany({
          where: { userId: passwordReset.userId }
        })
      ]);
      
      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  // Verify Email
  async verifyEmail(req, res) {
    try {
      const { token } = req.params;
      
      const emailVerification = await prisma.emailVerification.findUnique({
        where: { token }
      });
      
      if (!emailVerification || emailVerification.verified || emailVerification.expiresAt < new Date()) {
        return res.status(400).json({ error: 'Invalid or expired verification token' });
      }
      
      await prisma.$transaction([
        prisma.user.update({
          where: { id: emailVerification.userId },
          data: { isEmailVerified: true }
        }),
        prisma.emailVerification.update({
          where: { id: emailVerification.id },
          data: { verified: true }
        })
      ]);
      
      res.json({ message: 'Email verified successfully' });
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  // Logout
  async logout(req, res) {
    try {
      const refreshToken = req.body.refreshToken;
      const accessToken = req.headers.authorization?.split(' ')[1];
      
      if (refreshToken) {
        await prisma.session.deleteMany({
          where: { token: refreshToken }
        });
      }
      
      if (accessToken) {
        // Blacklist access token
        await redis.setex(`blacklist_${accessToken}`, 900, 'true'); // 15 minutes
      }
      
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  // Facebook OAuth Controller
  async facebookAuth(req, res) {
    try {
      const { code } = req.query;
      
      if (!code) {
        return res.status(400).json({ error: 'Authorization code required' });
      }
      
      const facebookService = require('../services/facebookAuth');
      
      // Exchange code for access token
      const accessToken = await facebookService.exchangeCodeForToken(code);
      
      // Get user profile
      const profile = await facebookService.getUserProfile(accessToken);
      
      // Find or create user
      const user = await facebookService.findOrCreateUser(profile);
      
      // Generate JWT tokens
      const { accessToken: jwtToken, refreshToken } = generateTokens({ userId: user.id });
      
      // Store session
      const ipAddress = req.ip;
      const userAgent = req.get('User-Agent');
      
      await prisma.session.create({
        data: {
          userId: user.id,
          token: refreshToken,
          userAgent,
          ipAddress,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });
      
      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });
      
      res.json({
        message: 'Facebook login successful',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified
        },
        accessToken: jwtToken,
        refreshToken
      });
    } catch (error) {
      console.error('Facebook auth error:', error);
      res.status(500).json({ error: 'Facebook authentication failed' });
    }
  }
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token required' });
      }
      
      const session = await prisma.session.findUnique({
        where: { token: refreshToken },
        include: { user: true }
      });
      
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
      
      // Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } = generateTokens({ 
        userId: session.userId 
      });
      
      // Update session
      await prisma.session.update({
        where: { id: session.id },
        data: {
          token: newRefreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });
      
      res.json({ accessToken, refreshToken: newRefreshToken });
    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = new AuthController();