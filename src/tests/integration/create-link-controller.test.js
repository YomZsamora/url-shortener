const request = require('supertest');
const app = require('../../index');
const { faker } = require('@faker-js/faker');
const redis = require('../../configs/redis');
const sequelize = require('../../configs/sequelize');
const config = require('../../configs/config');

beforeEach(async () => {
    await sequelize.query('TRUNCATE TABLE clicks, links CASCADE');
    await redis.flushdb();
});

describe('POST /api/v1/links', () => {

    it('returns 201 with a short URL for a valid request', async () => {
        const res = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });
            
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('success');
        expect(res.body.message).toBe('Short link created successfully.');

        expect(res.body.data.link.code).toHaveLength(7);
        expect(res.body.data.link.shortUrl).toBeDefined();
        expect(res.body.data.link.redirectType).toBe(302);
    });

    it('returns 201 with a custom alias', async () => {
        const res = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url(), alias: 'my-link' });
        
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('success');
        expect(res.body.message).toBe('Short link created successfully.');

        expect(res.body.data.link.code).toBe('my-link');
    });

    it('returns 201 with ttlDays and a correct expiresAt', async () => {
        const res = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url(), ttlDays: 7 });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('success');
        expect(res.body.message).toBe('Short link created successfully.');

        expect(res.body.data.link.expiresAt).not.toBeNull();
    });

    it('returns 201 with redirectType 301', async () => {
        const res = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url(), redirectType: 301 });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('success');
        expect(res.body.message).toBe('Short link created successfully.');
        
        expect(res.body.data.link.redirectType).toBe(301);
    });

    it('returns 409 for a duplicate custom alias', async () => {
        await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url(), alias: 'taken' });
        const res = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url(), alias: 'taken' });
        
        expect(res.status).toBe(409);
        expect(res.body.status).toBe('error');
        expect(res.body.message).toBe('This alias is already in use.');
    });

    it('returns 422 when url is missing', async () => {
        const res = await request(app)
            .post('/api/v1/links')
            .send({});
        
        expect(res.status).toBe(422);
        expect(res.body.data.errors[0].field).toBe('url');
    });

    it('returns 422 for a URL without a scheme', async () => {
        const res = await request(app)
            .post('/api/v1/links')
            .send({ url: 'www.example.com' });

        expect(res.status).toBe(422);
        expect(res.body.data.errors[0].field).toBe('url');
    });

    it('returns 422 for an alias with invalid characters', async () => {
        const res = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url(), alias: 'bad alias!' });

        expect(res.status).toBe(422);
        expect(res.body.data.errors[0].field).toBe('alias');
    });

    it('returns 429 after exceeding the rate limit', async () => {
        const payload = { url: faker.internet.url() };
        for (let i = 0; i < 10; i++) {
            await request(app).post('/api/v1/links').send(payload);
        }
        const res = await request(app).post('/api/v1/links').send(payload);
        
        expect(res.status).toBe(429);
        expect(res.body.status).toBe('error');
        expect(res.body.message).toBe(`Too many requests. You can create up to ${config.app.RATE_LIMIT_MAX} links per minute.`);
        expect(res.body.data).toHaveProperty('retryAfter');
    });
});
