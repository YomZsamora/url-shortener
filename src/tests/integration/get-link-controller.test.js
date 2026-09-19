const request = require('supertest');
const app = require('../../index');
const redis = require('../../configs/redis');
const { faker } = require('@faker-js/faker');
const sequelize = require('../../configs/sequelize');

beforeEach(async () => {
    await sequelize.query('TRUNCATE TABLE clicks, links CASCADE');
    await redis.flushdb();
});

describe('GET /api/v1/links/:code', () => {

    it('returns 200 with the link for a valid code', async () => {
        const url = faker.internet.url();
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url });

        const code = created.body.data.link.code;
        const res = await request(app)
            .get(`/api/v1/links/${code}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.message).toBe('Link retrieved successfully.');

        expect(res.body.data.link.code).toBe(code);
        expect(res.body.data.link.originalUrl).toBe(url);
    });

    it('returns 404 for a code that does not exist', async () => {
        const res = await request(app).get('/api/v1/links/doesnotexist');
        expect(res.status).toBe(404);
        expect(res.body.status).toBe('error');
        expect(res.body.message).toBe('Link not found.');
    });

    it('returns 404 for a soft-deleted link', async () => {
        const url = faker.internet.url();
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url });

        const code = created.body.data.link.code;
        await request(app).delete(`/api/v1/links/${code}`);

        const res = await request(app).get(`/api/v1/links/${code}`);
        expect(res.status).toBe(404);
    });
});
