const request = require('supertest');
const app = require('../../index');
const { faker } = require('@faker-js/faker');
const redis = require('../../configs/redis');
const sequelize = require('../../configs/sequelize');

beforeEach(async () => {
    await sequelize.query('TRUNCATE TABLE clicks, links CASCADE');
    await redis.flushdb();
});

describe('GET /api/v1/links', () => {
    
    it('returns 200 with an empty list when no links exist', async () => {
        const res = await request(app).get('/api/v1/links');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.data.links).toHaveLength(0);
        expect(res.body.data.pagination.total).toBe(0);
    });

    it('returns 200 with created links', async () => {
        await request(app).post('/api/v1/links').send({ url: faker.internet.url() });
        await request(app).post('/api/v1/links').send({ url: faker.internet.url() });
        const res = await request(app).get('/api/v1/links');
        expect(res.status).toBe(200);
        expect(res.body.data.links).toHaveLength(2);
        expect(res.body.data.pagination.total).toBe(2);
    });

    it('respects the limit query parameter', async () => {
        for (let i = 0; i < 5; i++) {
            await request(app).post('/api/v1/links').send({ url: `${faker.internet.url()}/${i}` });
        }
        const res = await request(app).get('/api/v1/links?limit=2');
        expect(res.status).toBe(200);
        expect(res.body.data.links).toHaveLength(2);
        expect(res.body.data.pagination.total).toBe(5);
        expect(res.body.data.pagination.totalPages).toBe(3);
    });

    it('returns the correct page with pagination', async () => {
        for (let i = 0; i < 3; i++) {
            await request(app).post('/api/v1/links').send({ url: `${faker.internet.url()}/${i}` });
        }
        const res = await request(app).get('/api/v1/links?limit=2&page=2');
        expect(res.status).toBe(200);
        expect(res.body.data.links).toHaveLength(1);
        expect(res.body.data.pagination.page).toBe(2);
    });

    it('excludes soft-deleted links by default', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });
        await request(app).delete(`/api/v1/links/${created.body.data.link.code}`);
        const res = await request(app).get('/api/v1/links');
        expect(res.body.data.links).toHaveLength(0);
    });

    it('includes soft-deleted links when includeDeleted=true', async () => {
        const created = await request(app)
            .post('/api/v1/links')
            .send({ url: faker.internet.url() });
        await request(app).delete(`/api/v1/links/${created.body.data.link.code}`);
        const res = await request(app).get('/api/v1/links?includeDeleted=true');
        expect(res.body.data.links).toHaveLength(1);
    });

    it('returns 422 for an invalid sort field', async () => {
        const res = await request(app).get('/api/v1/links?sort=invalid_field');
        expect(res.status).toBe(422);
    });
});
