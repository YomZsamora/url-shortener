const logger = require('../logger');
const { UnprocessableEntity } = require('./custom-exceptions');

const handleBadRequests = (schema, target = 'body') => (req, res, next) => {
    const { error, value } = schema.validate(req[target], { abortEarly: false, stripUnknown: true });
    if (error) {
        const errors = error.details.map(d => ({ field: d.path.join('.'), message: d.message }));
        return next(new UnprocessableEntity('Validation failed.', errors));
    }
    req[target] = value;
    req.valid = req.valid || {};
    req.valid[target] = value;
    next();
};

const exceptionHandler = (err, req, res, next) => {
    
    const statusCode = err.statusCode || 500;
    const isOperational = err.isOperational || false;

    if (isOperational) {
        logger.warn('Operational error', { statusCode, error: err.message, path: req.path });
    } else {
        logger.error('Unexpected error', { statusCode, error: err.message, stack: err.stack, path: req.path });
    }

    let data = {};
    if (err.errors) data = { errors: err.errors };
    else if (err.retryAfter != null) data = { retryAfter: err.retryAfter };

    res.status(statusCode).json({
        code: statusCode,
        status: 'error',
        message: isOperational ? err.message : 'An unexpected error occurred.',
        data,
    });
};

module.exports = { handleBadRequests, exceptionHandler };