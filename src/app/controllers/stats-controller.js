const config = require('../../configs/config');
const { ApiResponse } = require('../../utils/responses');
const linkRepository = require('../../repositories/link-repository');
const clickRepository = require('../../repositories/click-repository');
const linkSerializer = require('../../utils/serializers/link-serializer');
const { NotFound } = require('../../utils/exceptions/custom-exceptions');

const getLinkStats = async (req, res) => {

    const link = await linkRepository.findByCode(req.params.code);
    if (!link) throw new NotFound('Link not found.');

    const [clicksByDay, topReferrers] = await Promise.all([
        clickRepository.getClicksByDay(link.id),
        clickRepository.getTopReferrers(link.id),
    ]);

    res.status(200).json(
        new ApiResponse(200, 'Link stats retrieved successfully.', {
            stats: {
                code: link.code,
                shortUrl: `${config.app.BASE_URL}/${link.code}`,
                originalUrl: link.originalUrl,
                clickCount: Number(link.clickCount),
                clicksByDay: clicksByDay.map(r => ({ date: r.date, count: Number(r.count) })),
                topReferrers: topReferrers.map(r => ({ referrer: r.referrer, count: Number(r.count) })),
            },
        })
    );
};

const getSummary = async (req, res) => {
    const summary = await linkRepository.getSummary();
    res.status(200).json(
        new ApiResponse(200, 'Summary stats retrieved successfully.', { summary })
    );
};

module.exports = { getLinkStats, getSummary };
