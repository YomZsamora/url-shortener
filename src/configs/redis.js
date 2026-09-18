const Redis = require('ioredis');
const config = require('./config');
const logger = require('pino')({ level: config.app.LOG_LEVEL });

const env = process.env.NODE_ENV || 'development';
const redis = new Redis(config.app.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => logger.info({ env }, 'Connected to Redis successfully'));
redis.on('error', (err) => logger.error({ env, error: err.message }, 'Redis connection error'));

module.exports = redis;
