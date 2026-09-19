const request = require('supertest');
const app = require('../../index');
const redis = require('../../configs/redis');
const { faker } = require('@faker-js/faker');
const sequelize = require('../../configs/sequelize');

beforeEach(async () => {
    await sequelize.query('TRUNCATE TABLE clicks, links CASCADE');
    await redis.flushdb();
});

describe('GET /api/v1/links/:code/stats', () => {

    it('returns 200 with stats for an existing link', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });
        const code = created.body.data.link.code;

        const res = await request(app).get(`/api/v1/links/${code}/stats`);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.data.stats).toHaveProperty('code', code);
        expect(res.body.data.stats).toHaveProperty('clickCount');
        expect(res.body.data.stats).toHaveProperty('clicksByDay');
        expect(res.body.data.stats).toHaveProperty('topReferrers');
        expect(Array.isArray(res.body.data.stats.clicksByDay)).toBe(true);
        expect(Array.isArray(res.body.data.stats.topReferrers)).toBe(true);
    });

    it('returns clickCount that reflects redirects', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });
        const code = created.body.data.link.code;

        // Two redirects — wait for fire-and-forget writes to complete
        await request(app).get(`/${code}`);
        await request(app).get(`/${code}`);
        await new Promise(resolve => setTimeout(resolve, 300));

        const res = await request(app).get(`/api/v1/links/${code}/stats`);
        expect(res.body.data.stats.clickCount).toBe(2);
    });

    it('returns 404 for a code that does not exist', async () => {
        const res = await request(app).get('/api/v1/links/doesnotexist/stats');
        expect(res.status).toBe(404);
    });
});

describe('GET /api/v1/stats/summary', () => {

    it('returns 200 with summary totals', async () => {
        const res = await request(app).get('/api/v1/stats/summary');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.data.summary).toHaveProperty('totalLinks');
        expect(res.body.data.summary).toHaveProperty('activeLinks');
        expect(res.body.data.summary).toHaveProperty('totalClicks');
    });

    it('counts only non-deleted links in totalLinks', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });
        await request(app).post('/api/v1/links').send({ url: faker.internet.url() });
        await request(app).delete(`/api/v1/links/${created.body.data.link.code}`);
        const res = await request(app).get('/api/v1/stats/summary');
        expect(res.body.data.summary.totalLinks).toBe(1);
    });

    it('counts only active (non-expired) links in activeLinks', async () => {
        await request(app).post('/api/v1/links').send({ url: faker.internet.url() });
        const expiring = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url(), ttlDays: 1 });
        await sequelize.query(
            `UPDATE links SET expires_at = NOW() - INTERVAL '1 hour' WHERE code = :code`,
            { replacements: { code: expiring.body.data.link.code } }
        );

        const res = await request(app).get('/api/v1/stats/summary');
        expect(res.body.data.summary.totalLinks).toBe(2);
        expect(res.body.data.summary.activeLinks).toBe(1);
    });

    it('returns zero counts when no links exist', async () => {
        const res = await request(app).get('/api/v1/stats/summary');
        expect(res.body.data.summary.totalLinks).toBe(0);
        expect(res.body.data.summary.activeLinks).toBe(0);
        expect(res.body.data.summary.totalClicks).toBe(0);
    });
});
