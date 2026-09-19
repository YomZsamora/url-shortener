const request = require('supertest');
const app = require('../../index');
const redis = require('../../configs/redis');
const { faker } = require('@faker-js/faker');
const sequelize = require('../../configs/sequelize');

beforeEach(async () => {
    await sequelize.query('TRUNCATE TABLE clicks, links CASCADE');
    await redis.flushdb();
});

describe('DELETE /api/v1/links/:code', () => {

    it('returns 204 for an existing link', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url:faker.internet.url() });
        const code = created.body.data.link.code;
        const res = await request(app).delete(`/api/v1/links/${code}`);
        expect(res.status).toBe(204);
    });

    it('returns 404 for a code that does not exist', async () => {
        const res = await request(app).delete('/api/v1/links/doesnotexist');
        expect(res.status).toBe(404);
    });

    it('returns 404 when deleting an already soft-deleted link', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });

        const code = created.body.data.link.code;
        await request(app).delete(`/api/v1/links/${code}`);
        const res = await request(app).delete(`/api/v1/links/${code}`);
        expect(res.status).toBe(404);
    });

    it('makes the link unreachable via GET after deletion', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });
        
        const code = created.body.data.link.code;
        await request(app).delete(`/api/v1/links/${code}`);
        const res = await request(app).get(`/api/v1/links/${code}`);
        expect(res.status).toBe(404);
    });
});
