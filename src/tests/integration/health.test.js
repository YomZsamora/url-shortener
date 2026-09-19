const request = require('supertest');
const app = require('../../index');

describe('GET /health', () => {
    it('returns 200 with postgres and redis status', async () => {
        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.message).toBe('All systems operational.');

        expect(res.body.data).toHaveProperty('postgres');
        expect(res.body.data).toHaveProperty('redis');
    });
});
