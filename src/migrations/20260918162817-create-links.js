'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('links', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.literal('gen_random_uuid()'),
                primaryKey: true,
                allowNull: false,
            },
            code: {
                type: Sequelize.STRING(20),
                allowNull: false,
                unique: true,
            },
            original_url: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            redirect_type: {
                type: Sequelize.SMALLINT,
                allowNull: false,
                defaultValue: 302,
            },
            click_count: {
                type: Sequelize.BIGINT,
                allowNull: false,
                defaultValue: 0,
            },
            expires_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            deleted_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
        });

        await queryInterface.addIndex('links', ['code'], {
            name: 'idx_links_code',
            unique: true,
        });
        await queryInterface.addIndex('links', ['deleted_at'], {
            name: 'idx_links_deleted_at',
        });
        await queryInterface.addIndex('links', ['expires_at'], {
            name: 'idx_links_expires_at',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('links');
    },
};