const { DataTypes } = require('sequelize');
const sequelize = require('../configs/sequelize');

const Click = sequelize.define('Click', {
    id:        { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    linkId:    { type: DataTypes.UUID, allowNull: false, references: { model: 'links', key: 'id' } },
    clickedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    ipAddress: { type: DataTypes.INET, allowNull: true },
    userAgent: { type: DataTypes.TEXT, allowNull: true },
    referrer:  { type: DataTypes.TEXT, allowNull: true },
}, {
    tableName: 'clicks',
    timestamps: false,
    underscored: true,
    indexes: [
        { name: 'idx_clicks_link_id_clicked_at', fields: ['link_id', 'clicked_at'] },
    ],
});

module.exports = { Click };
