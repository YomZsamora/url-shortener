const rateLimiter = require('./rate-limiter');
const { handleBadRequests } = require('../../utils/exceptions/exception-handler');
const {
    createLinkSchema,
    updateLinkSchema,
    listLinksSchema,
} = require('../../utils/validators/link-validators');

const createLinkMiddlewares = [handleBadRequests(createLinkSchema), rateLimiter];
const updateLinkMiddlewares = [handleBadRequests(updateLinkSchema)];
const listLinksMiddlewares = [handleBadRequests(listLinksSchema, 'query')];

module.exports = { createLinkMiddlewares, updateLinkMiddlewares, listLinksMiddlewares };
