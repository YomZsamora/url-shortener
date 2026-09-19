const { DataTypes } = require('sequelize');
const sequelize = require('../configs/sequelize');

const Link = sequelize.define('Link', {
    id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code:         { type: DataTypes.STRING(20), allowNull: false, unique: true },
    originalUrl:  { type: DataTypes.TEXT, allowNull: false },
    redirectType: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 302 },
    clickCount:   { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    expiresAt:    { type: DataTypes.DATE, allowNull: true },
    deletedAt:    { type: DataTypes.DATE, allowNull: true },
}, {
    tableName: 'links',
    underscored: true,
    indexes: [
        { name: 'idx_links_code',       fields: ['code'], unique: true },
        { name: 'idx_links_deleted_at', fields: ['deleted_at'] },
        { name: 'idx_links_expires_at', fields: ['expires_at'] },
    ],
});

module.exports = { Link };
