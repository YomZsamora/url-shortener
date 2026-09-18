require('dotenv').config();
const { Sequelize } = require('sequelize');
const appConfig = require('../configs/config');

const env = process.env.NODE_ENV || 'development';
const config = appConfig[env];
const logger = require('pino')({ level: appConfig.app.LOG_LEVEL });

if (!config) throw new Error(`No configuration found for environment: ${env}`);
if (!config.database || !config.username || !config.password || !config.host)
    throw new Error(`Missing required database configuration for environment: ${env}`);

const sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    dialect: config.dialect,
    logging: false,
});

sequelize
    .authenticate()
    .then(() => logger.info('Database connected successfully'))
    .catch((err) => logger.error({ error: err.message }, 'Database connection error'));

module.exports = sequelize;
