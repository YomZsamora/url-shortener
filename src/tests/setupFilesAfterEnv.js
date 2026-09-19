afterAll(async () => {
    const sequelize = require('../configs/sequelize');
    const redis = require('../configs/redis');
    await sequelize.close();
    await redis.quit();
    jest.resetModules();
});
