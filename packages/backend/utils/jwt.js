// utils/jwt.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
  
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE,
  });
  
  return { accessToken, refreshToken };
};

const verifyToken = (token, secret = process.env.JWT_SECRET) => {
  return jwt.verify(token, secret);
};

const generateSecureToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

module.exports = { generateTokens, verifyToken, generateSecureToken };