'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('clicks', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.literal('gen_random_uuid()'),
                primaryKey: true,
                allowNull: false,
            },
            link_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'links',
                    key: 'id',
                },
                onDelete: 'CASCADE',
            },
            clicked_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('NOW()'),
            },
            ip_address: {
                type: Sequelize.INET,
                allowNull: true,
            },
            user_agent: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            referrer: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
        });

        await queryInterface.addIndex('clicks', ['link_id', 'clicked_at'], {
            name: 'idx_clicks_link_id_clicked_at',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('clicks');
    },
};