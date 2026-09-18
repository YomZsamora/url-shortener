class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class BadRequest extends AppError {
    constructor(message = 'Bad Request') {
        super(message, 400);
    }
}

class NotFound extends AppError {
    constructor(message = 'Not Found') {
        super(message, 404);
    }
}

class Conflict extends AppError {
    constructor(message = 'Conflict') {
        super(message, 409);
    }
}

class Gone extends AppError {
    constructor(message = 'This link has expired and is no longer active.') {
        super(message, 410);
    }
}

class UnprocessableEntity extends AppError {
    constructor(message = 'Validation failed.', errors = []) {
        super(message, 422);
        this.errors = errors;
    }
}

class TooManyRequests extends AppError {
    constructor(message = 'Too many requests.', retryAfter = null) {
        super(message, 429);
        this.retryAfter = retryAfter;
    }
}

module.exports = {
    AppError,
    BadRequest,
    NotFound,
    Conflict,
    Gone,
    UnprocessableEntity,
    TooManyRequests,
};
