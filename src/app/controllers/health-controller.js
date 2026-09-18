const sequelize = require('../../configs/sequelize');
const redis = require('../../configs/redis');

const healthCheck = async (req, res) => {

    const services = { postgres: 'disconnected', redis: 'disconnected' };

    try {
        await sequelize.authenticate();
        services.postgres = 'connected';
    } catch (_) {}

    try {
        await redis.ping();
        services.redis = 'connected';
    } catch (_) {}

    const allHealthy = Object.values(services).every(s => s === 'connected');

    if (allHealthy) {
        return res.status(200).json({
            code: 200,
            status: 'success',
            message: 'All systems operational.',
            data: services,
        });
    }

    res.status(503).json({
        code: 503,
        status: 'error',
        message: 'One or more services are unavailable.',
        data: services,
    });
};

module.exports = { healthCheck };
