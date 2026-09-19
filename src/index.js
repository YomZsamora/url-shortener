require('dotenv').config();
const cors = require('cors');
require('./configs/sequelize');
const helmet = require('helmet');
const express = require('express');
const logger = require('./utils/logger');
const config = require('./configs/config');
const linksRouter  = require('./app/routes/links-routes');
const healthRouter = require('./app/routes/health-routes');
const redirectRouter = require('./app/routes/redirect-routes');
const { exceptionHandler } = require('./utils/exceptions/exception-handler');

const app = express();
const PORT = config.app.PORT;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);
app.use('/api/v1/links', linksRouter);
app.use('/', redirectRouter);

app.use(exceptionHandler);

if (require.main === module) {
    app.listen(PORT, () => {
        logger.info('URL Shortener started', { port: PORT });
    });
}

module.exports = app;
