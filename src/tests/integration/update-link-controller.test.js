const request = require('supertest');
const app = require('../../index');
const redis = require('../../configs/redis');
const { faker } = require('@faker-js/faker');
const sequelize = require('../../configs/sequelize');

beforeEach(async () => {
    await sequelize.query('TRUNCATE TABLE clicks, links CASCADE');
    await redis.flushdb();
});

describe('PATCH /api/v1/links/:code', () => {

    it('returns 200 and updates the original URL', async () => {
        const url = faker.internet.url();
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url });
        
            const code = created.body.data.link.code;

        const updatedUrl = faker.internet.url();
        const res = await request(app)
            .patch(`/api/v1/links/${code}`)
            .send({ url: updatedUrl });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.message).toBe('Link updated successfully.');
        expect(res.body.data.link.originalUrl).toBe(updatedUrl);
    });

    it('returns 200 and updates the redirect type', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });
        
        const code = created.body.data.link.code;
        const res = await request(app)
            .patch(`/api/v1/links/${code}`)
            .send({ redirectType: 301 });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.message).toBe('Link updated successfully.');
        expect(res.body.data.link.redirectType).toBe(301);
    });

    it('returns 200 and sets an expiry when ttlDays is provided', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });

        const code = created.body.data.link.code;
        const res = await request(app)
            .patch(`/api/v1/links/${code}`)
            .send({ ttlDays: 7 });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.message).toBe('Link updated successfully.');
        expect(res.body.data.link.expiresAt).not.toBeNull();
    });

    it('returns 200 and removes the expiry when ttlDays is null', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url(), ttlDays: 7 });
        const code = created.body.data.link.code;

        const res = await request(app)
            .patch(`/api/v1/links/${code}`)
            .send({ ttlDays: null });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.message).toBe('Link updated successfully.');
        expect(res.body.data.link.expiresAt).toBeNull();
    });

    it('returns 404 for a code that does not exist', async () => {
        const res = await request(app)
            .patch('/api/v1/links/doesnotexist')
            .send({ url: faker.internet.url() });
        expect(res.status).toBe(404);
    });

    it('returns 422 for an empty body', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });
            
        const code = created.body.data.link.code;
        const res = await request(app)
            .patch(`/api/v1/links/${code}`)
            .send({});
        expect(res.status).toBe(422);
    });
});
