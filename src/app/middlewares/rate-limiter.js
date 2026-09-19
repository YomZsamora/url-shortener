const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../../configs/redis');
const config = require('../../configs/config');
const logger = require('../../utils/logger');

const rateLimiter = rateLimit({
    windowMs: config.app.RATE_LIMIT_WINDOW_MS,
    max: config.app.RATE_LIMIT_MAX,
    keyGenerator: (req) => `rl:create:${req.ip}`,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args),
    }),
    handler: (req, res) => {
        const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
        logger.warn('Rate limit hit', { ip: req.ip, path: req.path });
        res.status(429).json({
            code: 429,
            status: 'error',
            message: `Too many requests. You can create up to ${config.app.RATE_LIMIT_MAX} links per minute.`,
            data: { retryAfter },
        });
    },
    skip: (req) => {
        if (!redis.status || redis.status !== 'ready') {
            logger.warn('Rate limiter skipped — Redis unavailable', { ip: req.ip });
            return true;
        }
        return false;
    },
});

module.exports = rateLimiter;