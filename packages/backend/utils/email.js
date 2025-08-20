// utils/email.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Verify Your Email',
    html: `
      <h2>Email Verification</h2>
      <p>Click the link below to verify your email:</p>
      <a href="${verificationUrl}">${verificationUrl}</a>
      <p>This link expires in 24 hours.</p>
    `,
  });
};

const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Reset Your Password',
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>This link expires in 1 hour.</p>
    `,
  });
};

const sendAccountRecoveryEmail = async (email, data) => {
  const recoveryUrl = `${process.env.FRONTEND_URL}/account-recovery?token=${data.recoveryToken}`;
  
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Account Recovery Information',
    html: `
      <h2>Account Recovery</h2>
      <p>We received a request to recover your account. Here are your account details:</p>
      <ul>
        <li><strong>Username:</strong> ${data.username || 'Not set'}</li>
        <li><strong>Email:</strong> ${data.email}</li>
      </ul>
      <p>If you forgot your password, you can reset it using the link below:</p>
      <a href="${recoveryUrl}">Reset Password</a>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
  });
};

module.exports = { 
  sendVerificationEmail, 
  sendPasswordResetEmail, 
  sendAccountRecoveryEmail 
};