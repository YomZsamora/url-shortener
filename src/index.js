require('dotenv').config();
require('./configs/sequelize');
const express = require('express');
const logger = require('./utils/logger');
const { exceptionHandler } = require('./utils/exceptions/exception-handler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());


app.use(exceptionHandler);

if (require.main === module) {
    app.listen(PORT, () => {
        logger.info('URL Shortener started', { port: PORT });
    });
}

module.exports = app;
