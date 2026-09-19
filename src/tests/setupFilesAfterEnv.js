afterAll(async () => {
    jest.clearAllMocks();
    // Let setImmediate fire-and-forget callbacks run, then give their DB writes time to finish
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setTimeout(resolve, 200));
    const sequelize = require('../configs/sequelize');
    const redis = require('../configs/redis');
    await sequelize.close();
    await redis.quit();
    jest.resetModules();
});
