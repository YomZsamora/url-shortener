const config = require('../../configs/config');

const serializeLink = (link) => ({
    id: link.id,
    code: link.code,
    shortUrl: `${config.app.BASE_URL}/${link.code}`,
    originalUrl: link.originalUrl,
    redirectType: link.redirectType,
    clickCount: Number(link.clickCount),
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
});

const serializeLinkList = (rows, count, page, limit) => ({
    links: rows.map(serializeLink),
    pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
    },
});

module.exports = { serializeLink, serializeLinkList };
