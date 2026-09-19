const { ApiResponse } = require('../../utils/responses');
const linkRepository = require('../../repositories/link-repository');
const { generateUniqueCode } = require('../../utils/code-generator');
const { Conflict } = require('../../utils/exceptions/custom-exceptions');
const linkSerializer = require('../../utils/serializers/link-serializer');

const createLink = async (req, res) => {
    
    const { url, alias, ttlDays, redirectType } = req.body;
    const code = alias ?? await generateUniqueCode();
    const existing = await linkRepository.findByCode(code);
    if (existing) throw new Conflict('This alias is already in use.');
    const expiresAt = ttlDays
        ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
        : null;
    const link = await linkRepository.create({
        code,
        originalUrl: url,
        redirectType,
        expiresAt,
    });
    res.status(201).json(
        new ApiResponse(201, 'Short link created successfully.', {
            link: linkSerializer.serializeLink(link),
        })
    );
};

module.exports = { createLink };
