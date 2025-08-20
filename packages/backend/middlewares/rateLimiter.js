// rateLimiter
// middleware/rateLimit.js
const rateLimit = require('express-rate-limit');
const redis = require('../config/redis');

const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    store: {
      incr: async (key) => {
        const current = await redis.incr(key);
        if (current === 1) {
          await redis.expire(key, Math.ceil(windowMs / 1000));
        }
        return { totalHits: current };
      },
      decrement: async (key) => {
        return await redis.decr(key);
      },
      resetKey: async (key) => {
        return await redis.del(key);
      }
    }
  });
};

const loginRateLimit = createRateLimit(15 * 60 * 1000, 5, 'Too many login attempts');
const registerRateLimit = createRateLimit(60 * 60 * 1000, 3, 'Too many registration attempts');
const forgotPasswordRateLimit = createRateLimit(60 * 60 * 1000, 3, 'Too many password reset attempts');

module.exports = {
  loginRateLimit,
  registerRateLimit,
  forgotPasswordRateLimit
};