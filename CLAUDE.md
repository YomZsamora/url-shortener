# CLAUDE.md — url-shortener

This file provides guidance for AI coding agents working on the URL Shortener service — a RESTful
backend that converts long URLs into short codes, redirects clients, and records click analytics.
The primary architectural lesson of this project is Redis caching on a read-heavy workload.

---

## Tech Stack

| Concern | Choice |
| --- | --- |
| **Runtime** | Node.js ≥ 20 LTS |
| **HTTP framework** | Express.js + `express-async-errors` |
| **Database / ORM** | PostgreSQL via `sequelize` v6 + `sequelize-cli` (migrations only — no `sync({ force: true })`) |
| **Cache & rate-limit store** | Redis 7 via `ioredis` |
| **Short code generation** | `nanoid` (7-char URL-safe alphabet) |
| **Validation** | `joi` (body validation middleware factory) |
| **Rate limiting** | `express-rate-limit` + `rate-limit-redis` |
| **API docs** | `swagger-jsdoc` + `swagger-ui-express` (served at `/api/v1/docs`) |
| **Logging** | `winston` (structured JSON) |
| **HTTP security** | `helmet` + `cors` |
| **Environment config** | `dotenv` |
| **Testing** | Jest + Supertest |
| **Containerization** | Docker + Docker Compose (app + PostgreSQL + Redis) |

> **No auth.** All links are anonymous in v1. No JWT, no session middleware, no `bcryptjs`.
>
> **Replace boilerplate leftovers:** `express-validator` and `pino` are installed from the project
> boilerplate but are **not used in this service**. Replace all usages with `joi` (validation) and
> `winston` (logging). The `exception-handler.js` currently uses both — rewrite it completely before
> any feature work begins.

---

## Repository Layout

```
src/
  index.js                              # Express app entry point — middleware, routes, starts server
  app/
    controllers/
      links-controller.js               # Create, list, get, update, soft-delete link operations
      redirect-controller.js            # GET /:code — cache-aside lookup + fire-and-forget analytics
      stats-controller.js               # Per-link and system-wide analytics aggregation
    middlewares/
      links-middlewares.js              # Middleware arrays for each links route (validate + rateLimiter)
      rate-limiter.js                   # express-rate-limit + rate-limit-redis store
    routes/
      links-routes.js
      redirect-routes.js
      stats-routes.js
  configs/
    config.js                           # Sequelize dialect configs (dev/test) + app config object
    env.js                              # Validated, exported env vars — all process.env reads live here
    sequelize.js                        # Sequelize instance
    redis.js                            # ioredis client with reconnect + error handling
  models/
    link.js                             # Sequelize model — sequelize.define(...)
    click.js                            # Sequelize model — sequelize.define(...)
  migrations/                           # Sequelize-CLI migrations
  repositories/
    link-repository.js                  # All Link model queries (findByCode, create, update, etc.)
    click-repository.js                 # All Click model queries (create, aggregations for stats)
  utils/
    code-generator.js                   # nanoid wrapper + collision check + retry loop
    cache-service.js                    # ioredis wrappers: getLink, setLink, deleteLink
    responses.js                        # ApiResponse class — builds { code, status, message, data }
    logger.js                           # Shared winston logger instance
    exceptions/
      custom-exceptions.js              # Custom error classes (AppError, BadRequest, NotFound, etc.)
      exception-handler.js              # Global error handler (exceptionHandler) + handleBadRequests
    serializers/
      link-serializer.js                # serializeLink, serializeLinkList — called only from controllers
    validators/
      link-validators.js                # Joi schemas: createLinkSchema, updateLinkSchema, listLinksQuery
  tests/
    setup.js                            # globalSetup — creates test DB, runs migrations
    teardown.js                         # globalTeardown — drops test DB
    setupFilesAfterEnv.js               # afterAll — closes Sequelize + Redis connections
    unit/
      code-generator.test.js
    integration/
      links.test.js
      redirect.test.js
      stats.test.js
      health.test.js
```

> **Note on `src/configs/`:** The existing boilerplate uses `src/configs/` (plural). Follow the
> **existing `src/configs/` convention** — do not rename it.
>
> **Note on `configs/sequelize.js`:** The boilerplate calls this `sequelize.js`. Keep that name.

---

## Architecture Rules

1. **The redirect path is the critical path** — `GET /:code` must be as fast as possible. Every
   architectural decision (Redis caching, async analytics writes, denormalized `click_count`) exists
   to protect its latency. Target: < 5ms on cache hit, < 50ms on cache miss.

2. **Cache-aside only** — Redis is never written at link creation time. It is populated on the *first
   redirect request* for each code (cache miss path). This avoids caching links that are never clicked.

3. **Async writes after the redirect** — click events and `click_count` increments are written
   *after* `res.redirect()` has been called. Never `await` these inside the redirect response path.
   Use `setImmediate()` or fire a Promise without awaiting it. Errors from async writes are logged
   but never bubble up to the client.

4. **`cache-service.js` owns all Redis calls** — `getLink`, `setLink`, `deleteLink` are the only
   functions that touch the ioredis client. No controller or repository calls `redis.get/set/del`
   directly. This keeps Redis behaviour testable and centrally managed.

5. **`code-generator.js` has no Express dependency** — it imports `linkRepository` for the
   collision check, generates a nanoid code, and retries up to `CODE_MAX_RETRIES`. It is
   independently unit-testable with a mocked repository.

6. **Repositories own data access** — no controller queries a Sequelize model directly. All DB reads
   and writes go through `src/repositories/link-repository.js` or `src/repositories/click-repository.js`,
   called via namespace import (e.g. `const linkRepository = require('...')`).

7. **Thin controllers** — controllers call repositories and utilities; they do not contain raw
   Sequelize queries, direct ioredis calls, or nanoid calls. Shape: validate → call repository/utility
   → serialize → `res.json()`.

8. **Validation middleware is centralized** — Joi schemas live in `utils/validators/link-validators.js`.
   Middleware arrays for each route group are defined in `app/middlewares/links-middlewares.js`.
   The `handleBadRequests(schema)` helper from `exception-handler.js` applies the schema and calls
   `next(new UnprocessableEntity(...))` on failure. Controllers never validate manually.

9. **Serializers are called only from controllers** — `link-serializer.js` transforms model instances
   into API-safe objects. Import it via namespace (`const linkSerializer = require('...')`). Never
   call a serializer from a repository or middleware.

10. **Global error handler is last** — `exceptionHandler` from `utils/exceptions/exception-handler.js`
    is registered as the final middleware in `src/index.js`. Controllers call `next(error)` on failure;
    they never `res.json()` error responses directly. When adding a new exception class, add the
    matching `instanceof` block to `exceptionHandler`.

11. **All env vars through `src/configs/env.js`** — no file other than `env.js` reads `process.env`
    directly. `config.js` uses the values exported by `env.js` for the Sequelize dialect configs.

12. **Soft deletes only** — `DELETE /api/v1/links/:code` sets `deleted_at`; it never removes the row.
    All list queries and redirect lookups filter on `deleted_at IS NULL`.

13. **Route ordering matters** — `/:code` is registered *last* in `src/index.js`, after `/health` and
    `/api/*`. Otherwise Express will try to resolve `health` and `api` as short codes.

---

## Redis Key Schema

All Redis keys are namespaced.

| Key Pattern | Value | TTL | Purpose |
| --- | --- | --- | --- |
| `link:{code}` | JSON: `{ originalUrl, redirectType, expiresAt }` | 86 400 s (24 h, sliding) | Redirect cache — serves the hot path |
| `rl:create:{ip}` | Integer (counter) | 60 s (fixed window) | Rate limiter for `POST /api/v1/links` |

### Redis TTL vs Link Expiry

These are two independent concepts:
- **Redis TTL** (24 h) — cache freshness. When it expires, the next redirect is a cache miss and
  re-populates the cache from PostgreSQL.
- **`expires_at` column** — whether the link is still active at all. On a cache hit, the redirect
  service still checks `expiresAt` in the cached JSON before redirecting. An expired link returns
  410 even if its Redis entry is still live.

### Cache Invalidation Rules

| Trigger | Cache Action |
| --- | --- |
| `PATCH /api/v1/links/:code` (URL or `redirectType` changed) | `cacheService.deleteLink(code)` |
| `DELETE /api/v1/links/:code` (soft delete) | `cacheService.deleteLink(code)` |
| Link expires (detected at redirect time) | `cacheService.deleteLink(code)` then return 410 |
| `POST /api/v1/links` (new link created) | No cache write — populate on first redirect only |

### Redis Unavailability — Graceful Degradation

If Redis is unreachable, the service must **not** crash or return 500:

- **Redirect** — falls back to PostgreSQL directly; returns the redirect normally (just slower).
- **Rate limiting** — bypassed (fail-open); log a `warn` and allow the request.
- **Cache writes** — skipped silently.
- **`/health`** — reports Redis as `"degraded"` but returns 200.

`cacheService.js` wraps every ioredis call in try/catch. On error, log and return `null` (simulating a
cache miss). This way, all callers handle `null` uniformly without knowing Redis is down.

---

## Cache-Aside Flow (Redirect)

```
GET /:code

1. cacheService.getLink(code)
   ├── HIT  → parse JSON
   │          → check expiresAt
   │          ├── not expired → res.redirect(302/301)
   │          │                 → [async] write click event + increment click_count
   │          └── expired    → cacheService.deleteLink(code) → return 410
   │
   └── MISS → Link.findOne({ where: { code, deleted_at: null } })
              ├── not found → return 404
              ├── expired   → return 410
              └── found     → cacheService.setLink(code, { originalUrl, redirectType, expiresAt })
                              → res.redirect(302/301)
                              → [async] write click event + increment click_count
```

---

## Short Code Generation

`src/utils/code-generator.js` implements:

```js
const { customAlphabet } = require('nanoid');
const linkRepository = require('../repositories/link-repository');
const env = require('../configs/env');

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', env.CODE_LENGTH);

const generateUniqueCode = async () => {
    for (let attempt = 0; attempt < env.CODE_MAX_RETRIES; attempt++) {
        const code = nanoid();
        const exists = await linkRepository.findByCode(code);
        if (!exists) return code;
    }
    throw new Error('Failed to generate a unique short code after max retries');
};

module.exports = { generateUniqueCode };
```

- **7 characters** from `[A-Za-z0-9]` (64 symbols) by default.
- **Collision check** against the DB on every attempt — collision is extremely rare at this scale but
  the retry loop exists as a safety net.
- If `alias` is provided in the creation request, `generateUniqueCode` is skipped entirely. The alias
  is used as the code, and a standard uniqueness check returns 409 on duplicate.

---

## Validation (Joi)

Joi schemas live in `src/utils/validators/link-validators.js`. Middleware arrays that apply them
live in `src/app/middlewares/links-middlewares.js`. The `handleBadRequests(schema, target)` helper
from `exception-handler.js` wraps `schema.validate()` and calls `next(new UnprocessableEntity(...))`
on failure. Controllers never validate manually.

```js
// src/utils/exceptions/exception-handler.js — handleBadRequests helper (Joi edition)
const { UnprocessableEntity } = require('./custom-exceptions');

const handleBadRequests = (schema, target = 'body') => (req, res, next) => {
    const { error, value } = schema.validate(req[target], { abortEarly: false, stripUnknown: true });
    if (error) {
        const errors = error.details.map(d => ({ field: d.path.join('.'), message: d.message }));
        return next(new UnprocessableEntity('Validation failed.', errors));
    }
    req[target] = value; // replace with coerced, stripped values
    next();
};
```

```js
// src/app/middlewares/links-middlewares.js — example middleware arrays
const { createLinkSchema, updateLinkSchema, listLinksQuery } = require('../../utils/validators/link-validators');
const { handleBadRequests } = require('../../utils/exceptions/exception-handler');
const rateLimiter = require('./rate-limiter');

const createLinkMiddlewares = [handleBadRequests(createLinkSchema), rateLimiter];
const updateLinkMiddlewares = [handleBadRequests(updateLinkSchema)];
const listLinksMiddlewares  = [handleBadRequests(listLinksQuery, 'query')];
```

### POST /api/v1/links Schema

| Field | Rule |
| --- | --- |
| `url` | Required. Valid absolute URL. `http://` or `https://` only. Max 2,048 chars. Must not point back to the service itself. |
| `alias` | Optional. String. 3–20 chars. `/^[a-zA-Z0-9_-]+$/`. Must not be a reserved path (`health`, `api`). |
| `ttlDays` | Optional. Positive integer, 1–365. Converts to `expiresAt = now() + ttlDays days`. |
| `redirectType` | Optional. Integer. `301` or `302`. Default: `302`. |

### PATCH /api/v1/links/:code Schema

| Field | Rule |
| --- | --- |
| `url` | Optional. Same as POST. If provided, Redis cache is invalidated. |
| `ttlDays` | Optional. Same as POST. Pass `null` explicitly to remove expiry. |
| `redirectType` | Optional. `301` or `302`. If provided, Redis cache is invalidated. |
| *(empty body)* | Return 422 — at least one field required. |

### GET /api/v1/links Query Params

| Param | Rule |
| --- | --- |
| `page` | Optional. Positive integer. Default: `1`. |
| `limit` | Optional. Integer 1–100. Default: `20`. |
| `sort` | Optional. One of: `created_at`, `click_count`, `expires_at`. Default: `created_at`. |
| `order` | Optional. `asc` or `desc`. Default: `desc`. |
| `includeExpired` | Optional. Boolean. Default: `false`. |
| `includeDeleted` | Optional. Boolean. Default: `false`. |

> **422 vs 400:** Validation errors (bad field values) → 422 with `data.errors` array. Malformed JSON
> body (not parseable) → 400.

---

## Sequelize Models

Models use `sequelize.define(...)` directly — **not** the class/factory pattern.
Model files are lowercase kebab-case: `link.js`, `click.js`.

### link.js

```js
const { DataTypes } = require('sequelize');
const sequelize = require('../configs/sequelize');

const Link = sequelize.define('Link', {
    id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code:         { type: DataTypes.STRING(20), allowNull: false, unique: true },
    originalUrl:  { type: DataTypes.TEXT, allowNull: false },
    redirectType: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 302 },
    clickCount:   { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    expiresAt:    { type: DataTypes.DATE, allowNull: true },
    deletedAt:    { type: DataTypes.DATE, allowNull: true },
}, {
    tableName: 'links',
    indexes: [
        { name: 'idx_links_code',       fields: ['code'], unique: true },
        { name: 'idx_links_deleted_at', fields: ['deleted_at'] },
        { name: 'idx_links_expires_at', fields: ['expires_at'] },
    ],
});

module.exports = { Link };
```

### Click.js

```js
const { DataTypes } = require('sequelize');
const sequelize = require('../configs/database');

const Click = sequelize.define('Click', {
    id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    linkId:     { type: DataTypes.UUID, allowNull: false, references: { model: 'links', key: 'id' } },
    clickedAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    ipAddress:  { type: DataTypes.INET, allowNull: true },
    userAgent:  { type: DataTypes.TEXT, allowNull: true },
    referrer:   { type: DataTypes.TEXT, allowNull: true },
}, {
    tableName: 'clicks',
    timestamps: false,
    indexes: [
        { name: 'idx_clicks_link_id_clicked_at', fields: ['link_id', 'clicked_at'] },
    ],
});

module.exports = { Click };
```

> `click_count` is a denormalized counter on `links`. It is incremented asynchronously on each
> redirect — not calculated by counting `clicks` rows. The `clicks` table is the full event log used
> only by the analytics endpoints.

---

## API Endpoints

| Method | Path | Description | Rate Limited |
| --- | --- | --- | --- |
| `POST` | `/api/v1/links` | Create a shortened link | 10 req/min per IP |
| `GET` | `/:code` | Redirect to original URL | No |
| `GET` | `/api/v1/links` | List links (paginated, filterable) | No |
| `GET` | `/api/v1/links/:code` | Get single link metadata | No |
| `PATCH` | `/api/v1/links/:code` | Update URL or expiry | No |
| `DELETE` | `/api/v1/links/:code` | Soft-delete a link | No |
| `GET` | `/api/v1/links/:code/stats` | Per-link analytics | No |
| `GET` | `/api/v1/stats/summary` | System-wide stats | No |
| `GET` | `/health` | PostgreSQL + Redis health check | No |

### Route Ordering in `src/index.js`

Register routes in this exact order — most specific first:

```js
app.use('/health', healthRouter);
app.use('/api/v1', apiRouter);  // links, stats
app.use('/', redirectRouter);   // /:code — must be last
```

The `/:code` wildcard must be the lowest-priority route. If it is registered before `/api/*`, Express
will attempt to resolve `api` and `health` as short codes.

### Request & Response Examples

**POST /api/v1/links — 201 Created**
```json
{
  "code": 201,
  "status": "success",
  "message": "Short link created successfully.",
  "data": {
    "link": {
      "id": "uuid",
      "code": "my-link",
      "shortUrl": "https://sho.rt/my-link",
      "originalUrl": "https://www.example.com/...",
      "redirectType": 302,
      "clickCount": 0,
      "expiresAt": "2025-10-18T00:00:00.000Z",
      "createdAt": "2025-09-18T09:00:00.000Z"
    }
  }
}
```

**GET /:code — 302 Found** (no body; browser follows `Location` header)
```
HTTP/1.1 302 Found
Location: https://www.example.com/...
Cache-Control: no-store
```

**Error — 410 Gone**
```json
{ "code": 410, "status": "error", "message": "This link has expired and is no longer active.", "data": {} }
```

**Error — 429 Too Many Requests**
```json
{ "code": 429, "status": "error", "message": "Too many requests. You can create up to 10 links per minute.", "data": { "retryAfter": 47 } }
```

---

## Response Envelope

All JSON responses — success and error — use this exact shape from `src/utils/response.js`:

```json
{ "code": <HTTP status int>, "status": "success" | "error", "message": "...", "data": { ... } }
```

- On 422: `data.errors` is an array of `{ field, message }` objects.
- On 429: `data.retryAfter` is seconds until the rate-limit window resets.
- On all other errors: `data` is `{}`.
- The `GET /:code` redirect returns JSON for error cases (404, 410, 500) — **not HTML** — because
  clients may be programmatic, not browsers.

---

## HTTP Status Code Usage

| Code | When |
| --- | --- |
| `200 OK` | Successful GET |
| `201 Created` | Successful `POST /api/v1/links` |
| `204 No Content` | Successful `DELETE /api/v1/links/:code` |
| `301 Moved Permanently` | Redirect when `link.redirect_type = 301` |
| `302 Found` | Redirect when `link.redirect_type = 302` (default) |
| `400 Bad Request` | Malformed JSON body |
| `404 Not Found` | Code does not exist or is soft-deleted |
| `409 Conflict` | Custom alias already in use |
| `410 Gone` | Code exists but link has expired |
| `422 Unprocessable Entity` | Joi validation failed — field errors in `data.errors` |
| `429 Too Many Requests` | Rate limit exceeded — `data.retryAfter` in seconds |
| `500 Internal Server Error` | Unexpected — no stack traces exposed |
| `503 Service Unavailable` | `/health` when PostgreSQL or Redis is down |

---

## Custom Exceptions

`src/utils/exceptions/custom-exceptions.js` — extend `AppError` for each case. When adding a new
exception class, add the matching `instanceof` branch to `src/middleware/errorHandler.js`.

| Class | Status | When to throw |
| --- | --- | --- |
| `BadRequest` | 400 | Malformed body |
| `NotFound` | 404 | Code not in DB or soft-deleted |
| `Conflict` | 409 | Duplicate alias / code |
| `Gone` | 410 | Link has expired |
| `UnprocessableEntity` | 422 | Joi validation failure |
| `TooManyRequests` | 429 | Rate limit (express-rate-limit handler) |

---

## Logging (Winston)

Use `winston` for all logging. Never use `console.log` in production code paths. Create a shared
logger instance in `src/utils/logger.js` and import it everywhere.

```js
const winston = require('winston');
const env = require('../configs/env');

const logger = winston.createLogger({
    level: env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
});

module.exports = logger;
```

### Required Log Entries

| Event | Level | Required Fields |
| --- | --- | --- |
| Redirect — cache hit | `info` | `code`, `cacheHit: true`, `responseTime` |
| Redirect — cache miss | `info` | `code`, `cacheHit: false`, `responseTime` |
| Redirect — expired link | `warn` | `code` |
| Cache invalidation | `info` | `code`, `reason` ('update' / 'delete' / 'expired') |
| Rate limit hit | `warn` | `ip`, `path` |
| Async click-write failure | `error` | `linkId`, `error: err.message` |
| Redis unavailable (degraded) | `warn` | `error: err.message` |
| Operational error (4xx) | `warn` | `statusCode`, `error`, `path` |
| Unexpected error (5xx) | `error` | `statusCode`, `error`, `stack`, `path` |

---

## Rate Limiting

`src/middleware/rateLimiter.js` — applied only to `POST /api/v1/links`.

```js
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redisClient = require('../configs/redis');
const env = require('../configs/env');

const createLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,     // 60 000 ms (1 minute)
    max: env.RATE_LIMIT_MAX,                 // 10
    keyGenerator: (req) => req.ip,
    store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }),
    handler: (req, res) => {
        const retryAfter = Math.ceil(req.rateLimit.resetTime / 1000 - Date.now() / 1000);
        res.status(429).json({
            code: 429,
            status: 'error',
            message: `Too many requests. You can create up to ${env.RATE_LIMIT_MAX} links per minute.`,
            data: { retryAfter },
        });
    },
    skip: () => false, // when Redis is down, rate-limit-redis will throw; catch in redis.js and set skip
});
```

When Redis is unavailable, the `store` will throw. Wrap in a try/catch in `rateLimiter.js` to fail-open
(allow the request, log a `warn`).

---

## Security

### URL Validation Rules
- Only `http://` and `https://` schemes accepted. `javascript:`, `data:`, `file:` → 422.
- URL must not point back to the service itself (e.g. `https://sho.rt/anything`) → 422.
- Maximum URL length: 2,048 characters.
- Basic blocklist check for known malicious domains on creation (hardcoded list in v1).

### HTTP Headers (Helmet)
- `helmet()` on all responses.
- `Cache-Control: no-store` on all redirect responses (`302` and `301`).
- `X-Powered-By` removed.

### IP Address
- Captured from `X-Forwarded-For` (when behind a proxy) or `req.ip`.
- Stored in `clicks.ip_address` for analytics only — not displayed to any user.

---

## Async Analytics Pattern

This is the core fire-and-forget pattern. After calling `res.redirect()`, analytics writes happen in
the background without blocking the response:

```js
// In redirect.service.js
const redirect = async (req, res, next, code) => {
    // ... cache lookup, expiry check ...

    res.setHeader('Cache-Control', 'no-store');
    res.redirect(link.redirectType, link.originalUrl);

    // Fire-and-forget — do NOT await
    setImmediate(() => {
        Click.create({
            linkId: link.id,
            clickedAt: new Date(),
            ipAddress: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
            referrer: req.headers['referer'] || null,
        }).catch(err => logger.error({ linkId: link.id, error: err.message }, 'Async click write failed'));

        Link.increment('clickCount', { where: { id: link.id } })
            .catch(err => logger.error({ linkId: link.id, error: err.message }, 'Async click_count increment failed'));
    });
};
```

> `setImmediate` is preferred over `process.nextTick` for I/O work — it runs after I/O callbacks in
> the event loop, giving the redirect response time to flush to the client first.

---

## Testing Guidelines

### Test Types

| Type | Tool | What It Tests |
| --- | --- | --- |
| **Unit** | Jest | `codeGenerator.js` — DB call mocked |
| **Integration** | Supertest + Jest | Full HTTP request → controller → DB → serialized response |

Redis and the DB are **not mocked in integration tests** — a real test database and a real Redis
instance (from Docker Compose test profile) are used.

### Directory Structure

```
src/tests/
  setup.js                         # globalSetup — creates test DB, runs migrations
  teardown.js                      # globalTeardown — drops test DB
  setupFilesAfterEnv.js            # afterAll — closes Sequelize + Redis connections
  unit/
    codeGenerator.test.js
  integration/
    links.test.js                  # POST, GET, PATCH, DELETE /api/v1/links
    redirect.test.js               # GET /:code — cache hit/miss, expiry, deletion
    stats.test.js                  # /api/v1/links/:code/stats, /api/v1/stats/summary
    health.test.js                 # GET /health
```

### `setup.js`

Creates `POSTGRES_DATABASE_TEST` if it does not exist, then runs pending migrations:

```js
await execPromise('NODE_ENV=test npx sequelize-cli db:migrate');
```

`NODE_ENV=test` is required — without it, the CLI migrates the wrong database.

### `setupFilesAfterEnv.js`

Closes the Sequelize connection and the ioredis client after each test file. Failing to close the
Redis connection causes Jest to hang after the test suite completes.

### Unit Test Pattern — `codeGenerator.test.js`

```js
jest.mock('../models/Link');
const { Link } = require('../models/Link');
const { generateUniqueCode } = require('../utils/codeGenerator');

describe('generateUniqueCode', () => {
    it('returns a code when no collision', async () => {
        Link.findOne.mockResolvedValue(null);
        const code = await generateUniqueCode();
        expect(code).toHaveLength(7);
    });

    it('retries on collision and returns a different code', async () => {
        Link.findOne
            .mockResolvedValueOnce({ code: 'abc1234' }) // collision
            .mockResolvedValue(null);                   // clear on second attempt
        const code = await generateUniqueCode();
        expect(Link.findOne).toHaveBeenCalledTimes(2);
    });

    it('throws after max retries all collide', async () => {
        Link.findOne.mockResolvedValue({ code: 'anything' });
        await expect(generateUniqueCode()).rejects.toThrow('Failed to generate');
    });
});
```

### Integration Test Pattern

```js
// tests/integration/links.test.js
describe('POST /api/v1/links', () => {
    it('returns 201 with a short URL for a valid request', async () => {
        const res = await request(app)
            .post('/api/v1/links')
            .send({ url: 'https://www.example.com' });
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('success');
        expect(res.body.data.link.code).toHaveLength(7);
    });

    it('returns 422 for a URL without a scheme', async () => {
        const res = await request(app)
            .post('/api/v1/links')
            .send({ url: 'www.example.com' });
        expect(res.status).toBe(422);
        expect(res.body.data.errors[0].field).toBe('url');
    });

    it('returns 409 for a duplicate custom alias', async () => { ... });
    it('returns 429 after 10 requests per minute', async () => { ... });
});
```

### Coverage Expectations

**Unit tests (`codeGenerator.test.js`):**
- Code generation on first attempt (no collision).
- Collision retry — succeeds on second attempt.
- All retries exhausted — throws.

**Integration tests per endpoint:**
- Happy path: correct status code, response envelope, and data shape.
- Validation errors: 422 with field-level `data.errors`.
- Not found: 404 for unknown code.
- Business rule failures: 409 (duplicate alias), 410 (expired link).
- Error propagation: verify `next(error)` is called (not swallowed).

**Redirect-specific:**
- Cache miss on first request → cache hit on second request (verify Winston log output or spy on `cacheService`).
- Expired link returns 410 and Redis entry is removed.
- Deleted link returns 404.
- Redis down → redirect still works (falls through to DB).

---

## Environment Variables

All env vars are validated and exported by `src/configs/env.js`. No other file reads `process.env`.

| Variable | Description | Default |
| --- | --- | --- |
| `NODE_ENV` | Environment | `development` |
| `PORT` | Express server port | `3000` |
| `BASE_URL` | Public URL used to build `shortUrl` in responses | — |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `POSTGRES_USER` | DB user (for Sequelize CLI) | — |
| `POSTGRES_PASSWORD` | DB password | — |
| `POSTGRES_DATABASE` | DB name | — |
| `POSTGRES_DATABASE_TEST` | Test DB name | — |
| `POSTGRES_HOST` | DB host | `localhost` |
| `POSTGRES_PORT` | DB port | `5432` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `RATE_LIMIT_MAX` | Max link creations per window per IP | `10` |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window in ms | `60000` |
| `CACHE_TTL_SECONDS` | Redis TTL for link cache entries | `86400` |
| `CODE_LENGTH` | Length of generated short codes | `7` |
| `CODE_MAX_RETRIES` | Max retries on collision | `3` |
| `LOG_LEVEL` | Winston log level | `info` |

---

## Useful Commands

```bash
# Start the server
node src/index.js

# Start everything via Docker Compose
docker-compose up --build

# Run pending migrations
NODE_ENV=development npx sequelize-cli db:migrate

# Create a new migration
npx sequelize-cli migration:generate --name <description>

# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Test the redirect manually
curl -v http://localhost:3000/<code>

# Test creation
curl -X POST http://localhost:3000/api/v1/links \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.example.com", "ttlDays": 7}'
```

---

## Pull Requests & Commits

- Follow **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Keep commits small and focused — one concern per commit.
- Run `npm test` locally before opening a PR.
- PR descriptions must include: what changed, why, any new env vars, and any new migrations.
- Never force-push to `main`.

---

## Things Agents Must NOT Do

- Write to Redis at link creation time — the cache is populated on the *first redirect*, not at
  creation.
- `await` analytics writes (click event, `click_count` increment) inside the redirect response path
  — they must be fire-and-forget.
- Read `process.env` directly in any file other than `src/configs/env.js`.
- Call `redis.get/set/del` outside of `src/utils/cacheService.js`.
- Call `nanoid` outside of `src/utils/codeGenerator.js`.
- Put business logic (DB queries, cache calls, code generation) in controller files.
- Use `express-validator` — use `joi` and the `validate.js` middleware factory.
- Use `pino` — use `winston` via `src/utils/logger.js`.
- Use `console.log` in any production code path.
- Return HTML for error responses on `GET /:code` — always return JSON.
- Register `/:code` before `/health` or `/api/*` routes — the wildcard must be last.
- Skip the expiry check on a Redis cache hit — always check `expiresAt` from the cached JSON.
- `sync({ force: true })` the Sequelize models — use migrations only.
- Add auth middleware — this is an unauthenticated service in v1.
- Expose stack traces in any API response — sanitize all 500 responses.
- Perform synchronous analytics writes that block the redirect response.
- Cache the stats query results in Redis — analytics reads go directly to PostgreSQL in v1.
