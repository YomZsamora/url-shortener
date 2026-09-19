const { Op } = require('sequelize');
const { Link } = require('../models/link');

const findByCode = (code) =>
    Link.findOne({ where: { code, deletedAt: null } });

const create = (data) => Link.create(data);

const update = (code, data) =>
    Link.update(data, { where: { code, deletedAt: null }, returning: true });

const softDelete = (code) =>
    Link.update({ deletedAt: new Date() }, { where: { code, deletedAt: null } });

const incrementClickCount = (id) =>
    Link.increment('clickCount', { where: { id } });

const findAll = ({ limit, offset, order, includeExpired, includeDeleted }) => {
    const where = {};
    if (!includeDeleted) where.deletedAt = null;
    if (!includeExpired) where[Op.or] = [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }];

    return Link.findAndCountAll({ where, limit, offset, order });
};

const getSummary = async () => {
    const now = new Date();
    const totalLinks = await Link.count({ where: { deletedAt: null } });
    const activeLinks = await Link.count({
        where: {
            deletedAt: null,
            [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }],
        },
    });
    const totalClicks = (await Link.sum('clickCount', { where: { deletedAt: null } })) || 0;
    return { totalLinks, activeLinks, totalClicks };
};

module.exports = { findByCode, create, update, softDelete, incrementClickCount, findAll, getSummary };
