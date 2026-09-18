require('dotenv').config();
require('./configs/sequelize');
const express = require('express');
const config = require('./configs/config');
const logger = require('pino')({ level: config.app.LOG_LEVEL });
const { exceptionHandler } = require('./utils/exceptions/exception-handler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());


app.use(exceptionHandler);

if (require.main === module) {
    app.listen(PORT, () => {
        logger.info({ port: PORT }, 'URL Shortener started');
    });
}

module.exports = app;
