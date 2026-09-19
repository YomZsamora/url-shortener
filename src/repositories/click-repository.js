const { Op, fn, col, literal } = require('sequelize');
const { Click } = require('../models/click');

const create = (data) => Click.create(data);

const countByLinkId = (linkId) =>
    Click.count({ where: { linkId } });

const getClicksByDay = (linkId, days = 30) =>
    Click.findAll({
        where: {
            linkId,
            clickedAt: { [Op.gte]: literal(`NOW() - INTERVAL '${days} days'`) },
        },
        attributes: [
            [fn('DATE', col('clicked_at')), 'date'],
            [fn('COUNT', col('id')), 'count'],
        ],
        group: [fn('DATE', col('clicked_at'))],
        order: [[fn('DATE', col('clicked_at')), 'ASC']],
        raw: true,
    });

const getTopReferrers = (linkId, limit = 5) =>
    Click.findAll({
        where: { linkId, referrer: { [Op.ne]: null } },
        attributes: [
            'referrer',
            [fn('COUNT', col('id')), 'count'],
        ],
        group: ['referrer'],
        order: [[fn('COUNT', col('id')), 'DESC']],
        limit,
        raw: true,
    });

module.exports = { create, countByLinkId, getClicksByDay, getTopReferrers };
