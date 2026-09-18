const Redis = require('ioredis');
const config = require('./config');
const logger = require('./logger');

const env = process.env.NODE_ENV || 'development';
const redis = new Redis(config.app.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => logger.info('Connected to Redis successfully', { env }));
redis.on('error', (err) => logger.error('Redis connection error', { env, error: err.message }));

module.exports = redis;
