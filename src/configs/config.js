require('dotenv').config();

module.exports = {
    development: {
        username: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DATABASE,
        host: process.env.POSTGRES_HOST,
        port: parseInt(process.env.POSTGRES_PORT) || 5432,
        dialect: 'postgres',
    },
    test: {
        username: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DATABASE_TEST,
        host: process.env.POSTGRES_HOST,
        port: parseInt(process.env.POSTGRES_PORT) || 5432,
        dialect: 'postgres',
    },
    staging: {},
    production: {},

    app: {
        PORT: parseInt(process.env.PORT) || 3000,
        NODE_ENV: process.env.NODE_ENV || 'development',
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
        BASE_URL: process.env.BASE_URL,
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 10,
        RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
        CACHE_TTL_SECONDS: parseInt(process.env.CACHE_TTL_SECONDS) || 86400,
        CODE_LENGTH: parseInt(process.env.CODE_LENGTH) || 7,
        CODE_MAX_RETRIES: parseInt(process.env.CODE_MAX_RETRIES) || 3,
    }
};