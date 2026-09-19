const redis = require('../configs/redis');
const config = require('../configs/config');
const logger = require('../utils/logger');

const KEY = (code) => `link:${code}`;

const getLink = async (code) => {
    try {
        const data = await redis.get(KEY(code));
        return data ? JSON.parse(data) : null;
    } catch (err) {
        logger.warn('Redis unavailable on get', { error: err.message });
        return null;
    }
};

const setLink = async (code, payload) => {
    try {
        await redis.set(KEY(code), JSON.stringify(payload), 'EX', config.app.CACHE_TTL_SECONDS);
    } catch (err) {
        logger.warn('Redis unavailable on set', { error: err.message });
    }
};

const deleteLink = async (code) => {
    try {
        await redis.del(KEY(code));
    } catch (err) {
        logger.warn('Redis unavailable on delete', { error: err.message });
    }
};

module.exports = { getLink, setLink, deleteLink };
