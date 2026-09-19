const Joi = require('joi');
const config = require('../../configs/config');

const RESERVED_PATHS = ['health', 'api'];
const BASE_URL = config.app.BASE_URL;

const urlField = Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .max(2048)
    .custom((value, helpers) => {
        if (BASE_URL && value.startsWith(BASE_URL)) {
            return helpers.error('any.invalid');
        }
        return value;
    })
    .messages({
        'string.uri': '"url" must be a valid http or https URL.',
        'any.invalid': '"url" must not point back to this service.',
    });

const createLinkSchema = Joi.object({
    url: urlField.required(),
    alias: Joi.string()
        .min(3).max(20)
        .pattern(/^[a-zA-Z0-9_-]+$/)
        .custom((value, helpers) => {
            if (RESERVED_PATHS.includes(value.toLowerCase())) {
                return helpers.error('any.invalid');
            }
            return value;
        })
        .optional()
        .messages({
            'string.pattern.base': '"alias" may only contain letters, numbers, hyphens, and underscores.',
            'any.invalid': '"alias" uses a reserved path.',
        }),
    ttlDays: Joi.number().integer().min(1).max(365).optional(),
    redirectType: Joi.number().valid(301, 302).default(302).optional(),
});

const updateLinkSchema = Joi.object({
    url: urlField.optional(),
    ttlDays: Joi.alternatives().try(
        Joi.number().integer().min(1).max(365),
        Joi.valid(null)
    ).optional(),
    redirectType: Joi.number().valid(301, 302).optional(),
}).min(1).messages({
    'object.min': 'At least one field must be provided.',
});

const listLinksSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().valid('created_at', 'click_count', 'expires_at').default('created_at'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
    includeExpired: Joi.boolean().default(false),
    includeDeleted: Joi.boolean().default(false),
});

module.exports = { createLinkSchema, updateLinkSchema, listLinksSchema };
