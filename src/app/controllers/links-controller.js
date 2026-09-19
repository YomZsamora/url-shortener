const { ApiResponse } = require('../../utils/responses');
const cacheService = require('../../services/cache-service');
const linkRepository = require('../../repositories/link-repository');
const { generateUniqueCode } = require('../../utils/code-generator');
const linkSerializer = require('../../utils/serializers/link-serializer');
const logger = require('../../utils/logger');
const { Conflict, NotFound } = require('../../utils/exceptions/custom-exceptions');

const createLink = async (req, res) => {

    const { url, alias, ttlDays, redirectType } = req.body;

    const code = alias ?? (await generateUniqueCode());
    const existing = await linkRepository.findByCode(code);
    if (existing) throw new Conflict('This alias is already in use.');

    const expiresAt = ttlDays ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000) : null;

    const link = await linkRepository.create({ code, originalUrl: url, redirectType, expiresAt });
    res.status(201).json(
        new ApiResponse(201, 'Short link created successfully.', {
            link: linkSerializer.serializeLink(link),
        })
    );
};

const listLinks = async (req, res) => {

    const { page, limit, sort, order, includeExpired, includeDeleted } = req.valid.query;

    const { count, rows } = await linkRepository.findAll({
        limit,
        offset: (page - 1) * limit,
        order: [[sort, order.toUpperCase()]],
        includeExpired,
        includeDeleted,
    });
    res.status(200).json(
        new ApiResponse(
            200,
            'Links retrieved successfully.',
            linkSerializer.serializeLinkList(rows, count, page, limit)
        )
    );
};

const getLink = async (req, res) => {
    
    const link = await linkRepository.findByCode(req.params.code);
    if (!link) throw new NotFound('Link not found.');
    res.status(200).json(
        new ApiResponse(200, 'Link retrieved successfully.', {
            link: linkSerializer.serializeLink(link),
        })
    );
};

const updateLink = async (req, res) => {

    const { url, ttlDays, redirectType } = req.body;

    const link = await linkRepository.findByCode(req.params.code);
    if (!link) throw new NotFound('Link not found.');

    const updates = {};
    if (url !== undefined) updates.originalUrl = url;
    if (redirectType !== undefined) updates.redirectType = redirectType;
    if (ttlDays !== undefined) {
        updates.expiresAt =
            ttlDays === null ? null : new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    }

    const [, updatedRows] = await linkRepository.update(req.params.code, updates);
    await cacheService.deleteLink(req.params.code);
    logger.info('Cache invalidated', { code: req.params.code, reason: 'update' });

    res.status(200).json(
        new ApiResponse(200, 'Link updated successfully.', {
            link: linkSerializer.serializeLink(updatedRows[0]),
        })
    );
};

const deleteLink = async (req, res) => {
    const link = await linkRepository.findByCode(req.params.code);
    if (!link) throw new NotFound('Link not found.');
    await linkRepository.softDelete(req.params.code);
    await cacheService.deleteLink(req.params.code);
    logger.info('Cache invalidated', { code: req.params.code, reason: 'delete' });
    res.status(204).send();
};

module.exports = { createLink, listLinks, getLink, updateLink, deleteLink };
