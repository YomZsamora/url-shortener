const request = require('supertest');
const app = require('../../index');
const redis = require('../../configs/redis');
const { faker } = require('@faker-js/faker');
const sequelize = require('../../configs/sequelize');

beforeEach(async () => {
    await sequelize.query('TRUNCATE TABLE clicks, links CASCADE');
    await redis.flushdb();
});

describe('GET /:code — redirect', () => {

    it('returns 302 and the correct Location header', async () => {
        const url = faker.internet.url();
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url });
        const code = created.body.data.link.code;

        const res = await request(app).get(`/${code}`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(url);
    });

    it('returns 301 when the link has redirectType 301', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url(), redirectType: 301 });

        const code = created.body.data.link.code;
        const res = await request(app).get(`/${code}`);
        expect(res.status).toBe(301);
    });

    it('populates Redis on a cache miss and serves from cache on second request', async () => {
        const url = faker.internet.url();
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url });
        const code = created.body.data.link.code;

        // First request — cache miss, populates Redis
        await request(app).get(`/${code}`);
        const cached = await redis.get(`link:${code}`);
        expect(cached).not.toBeNull();
        expect(JSON.parse(cached).originalUrl).toBe(url);

        // Second request — served from cache
        const res = await request(app).get(`/${code}`);
        expect(res.status).toBe(302);
    });

    it('returns 404 for a code that does not exist', async () => {
        const res = await request(app).get('/doesnotexist');
        expect(res.status).toBe(404);
    });

    it('returns 404 for a soft-deleted link', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });

        const code = created.body.data.link.code;
        await request(app).delete(`/api/v1/links/${code}`);
        const res = await request(app).get(`/${code}`);
        expect(res.status).toBe(404);
    });

    it('returns 410 for an expired link (cache miss path)', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url(), ttlDays: 1 });
        const code = created.body.data.link.code;

        await sequelize.query(
            `UPDATE links SET expires_at = NOW() - INTERVAL '1 hour' WHERE code = :code`,
            { replacements: { code } }
        );

        const res = await request(app).get(`/${code}`);
        expect(res.status).toBe(410);
    });

    it('returns 410 for an expired link (cache hit path) and evicts the Redis entry', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url(), ttlDays: 1 });
        const code = created.body.data.link.code;

        // Warm the cache
        await request(app).get(`/${code}`);
        expect(await redis.get(`link:${code}`)).not.toBeNull();

        // Expire the link in Postgres and in the cached JSON
        await sequelize.query(
            `UPDATE links SET expires_at = NOW() - INTERVAL '1 hour' WHERE code = :code`,
            { replacements: { code } }
        );
        await redis.set(
            `link:${code}`,
            JSON.stringify({
                ...(JSON.parse(await redis.get(`link:${code}`))),
                expiresAt: new Date(Date.now() - 3600000).toISOString(),
            })
        );

        const res = await request(app).get(`/${code}`);
        expect(res.status).toBe(410);
        expect(await redis.get(`link:${code}`)).toBeNull();
    });

    it('invalidates the Redis cache when a link is updated', async () => {
        const url = faker.internet.url();
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url });
        const code = created.body.data.link.code;

        await request(app).get(`/${code}`);
        expect(await redis.get(`link:${code}`)).not.toBeNull();

        const updatedUrl = faker.internet.url();
        await request(app)
            .patch(`/api/v1/links/${code}`)
            .send({ url: updatedUrl });
        expect(await redis.get(`link:${code}`)).toBeNull();
    });
});
