# URL Shortener

A RESTful URL shortening service built with Node.js and Express. It converts long URLs into short codes, redirects clients with optional 301/302 semantics, records every click as a structured event for analytics, and keeps the redirect path fast through a Redis cache-aside layer — with graceful fallback to PostgreSQL when Redis is unavailable.

---

## Features

- **Cache-aside redirect path** — Redis is populated on the *first* redirect, not at link creation. Links that are never clicked are never cached. Subsequent redirects for the same code are served entirely from Redis, with no database query.
- **Denormalized** `click_count` — a counter column on the `links` table incremented asynchronously on every redirect; faster than a `COUNT(*)` over the `clicks` table for the common case of reading totals.
- **Fire-and-forget analytics** — click events and `click_count` increments are written *after* `res.redirect()` has flushed, inside `setImmediate()`. The redirect itself never waits for an analytics write.
- **Cache invalidation on mutation** — `PATCH` (update) and `DELETE` (soft-delete) evict the cached entry immediately so the next redirect reflects the change.
- **Graceful Redis degradation** — if Redis is unreachable, redirects fall through to PostgreSQL, rate limiting is bypassed (fail-open), and cache writes are silently skipped. The service never returns 500 for a Redis failure.
- **Fixed-window rate limiting** — `POST /api/v1/links` is limited to 10 creations per IP per minute via `express-rate-limit` backed by a Redis store. The limiter fails open when Redis is down.
- **Soft deletes only** — `DELETE /api/v1/links/:code` sets `deleted_at`; the row is never removed. Soft-deleted links return 404 on redirect; all list queries exclude them by default.
- **Link expiry** — links can be created with a `ttlDays` value. The expiry is stored as `expires_at` and checked on every redirect, including cache hits. An expired link returns 410 and its cache entry is evicted.
- **Structured logging** — Winston JSON logs at every lifecycle event; no `console.log` in any production code path.

---



## API Endpoints



### Links


| Method   | Path                  | Description                                  | Rate Limited      |
| -------- | --------------------- | -------------------------------------------- | ----------------- |
| `POST`   | `/api/v1/links`       | Create a shortened link                      | 10 req/min per IP |
| `GET`    | `/api/v1/links`       | List links (paginated, filterable, sortable) | No                |
| `GET`    | `/api/v1/links/:code` | Get single link metadata                     | No                |
| `PATCH`  | `/api/v1/links/:code` | Update URL, redirect type, or expiry         | No                |
| `DELETE` | `/api/v1/links/:code` | Soft-delete a link                           | No                |




### Analytics


| Method | Path                        | Description                                       |
| ------ | --------------------------- | ------------------------------------------------- |
| `GET`  | `/api/v1/links/:code/stats` | Per-link analytics (clicks by day, top referrers) |
| `GET`  | `/api/v1/stats/summary`     | System-wide totals (links, active links, clicks)  |




### Redirect & Infrastructure


| Method | Path      | Description                                                          |
| ------ | --------- | -------------------------------------------------------------------- |
| `GET`  | `/:code`  | Redirect to original URL (302 or 301 depending on link config)       |
| `GET`  | `/health` | Liveness and readiness check — reports `postgres` and `redis` status |


---



## Prerequisites

- Node.js 20+ (LTS)
- PostgreSQL 15+
- Redis 7+

---



## Tech Stack


| Concern                  | Choice                                       |
| ------------------------ | -------------------------------------------- |
| Runtime                  | Node.js (LTS)                                |
| Framework                | Express.js ^5.2                              |
| ORM                      | Sequelize ^6.37 + sequelize-cli              |
| Database                 | PostgreSQL                                   |
| Cache & rate-limit store | Redis via ioredis ^5.11                      |
| Short code generation    | nanoid ^3.3 (7-char URL-safe codes)          |
| Validation               | Joi ^18                                      |
| Rate limiting            | express-rate-limit ^8 + rate-limit-redis ^6  |
| Logging                  | Winston ^3                                   |
| HTTP security            | Helmet ^8 + cors ^2                          |
| Environment config       | dotenv ^17                                   |
| Testing                  | Jest ^30 + Supertest ^7 + @faker-js/faker ^9 |
| Dev server               | nodemon ^3                                   |


---



## Environment Variables

Create a `.env` file at the project root. All variables are required unless a default is noted.

```env
# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password
POSTGRES_DATABASE=url_shortener_db
POSTGRES_DATABASE_TEST=url_shortener_db_test

# Redis
REDIS_URL=redis://localhost:6379

# Application
BASE_URL=http://localhost:3000        # Used to build shortUrl in responses and block self-referential URLs
RATE_LIMIT_MAX=10                     # Max link creations per IP per window
RATE_LIMIT_WINDOW_MS=60000            # Rate-limit window in milliseconds (60 000 = 1 minute)
CACHE_TTL_SECONDS=86400               # Redis TTL for cached link entries (86 400 = 24 hours)
CODE_LENGTH=7                         # Length of auto-generated short codes
CODE_MAX_RETRIES=3                    # Max nanoid retries on collision
```

---



## Local Setup



### 1. Install dependencies

```bash
npm install
```



### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your database credentials and Redis URL
```



### 3. Run database migrations

```bash
npx sequelize-cli db:migrate
```



### 4. Start the development server

```bash
npm run dev
```

The server listens on `http://localhost:$PORT` (default: `3000`). A `GET /health` readiness check is available without authentication and reports live `postgres` and `redis` connection status.

### Docker

The service connects to PostgreSQL and Redis over the external `dev-infra` Docker network:

```bash
docker-compose up --build
```

The app is mapped to port `3038` on the host.

---



## Running Tests

Tests run against a dedicated `POSTGRES_DATABASE_TEST` database. Jest's `globalSetup` creates it and runs all pending migrations automatically before the suite starts; `globalTeardown` drops it when the suite finishes.

```bash
# Run the full test suite
npm test

# Run a single test file
npm test -- --testPathPattern=redirect

# Run with verbose output
npm test -- --verbose

# Run with coverage
npm test -- --coverage
```

Integration tests hit a real PostgreSQL database and a real Redis instance. No database or cache mocks are used — this keeps test behaviour faithful to production query semantics and ensures the full middleware chain, validators, cache layer, and fire-and-forget writes all execute end-to-end.

The suite runs with `--runInBand` because integration test files share the same Postgres and Redis instances. Running files in parallel caused race conditions where one file's `beforeEach` TRUNCATE deleted rows another file had just inserted.

---



## Database Migrations

```bash
# Run pending migrations (development database)
npx sequelize-cli db:migrate

# Generate a new migration file
npx sequelize-cli migration:generate --name <description>

# Undo the last migration
npx sequelize-cli db:migrate:undo
```

Migrations live in `src/migrations/` and follow the pattern `<timestamp>-<description>.js`. Never use `sync({ force: true })` — migrations are the only mechanism for schema changes.

---



## How It Works

Three areas of this service are worth understanding in depth: how the cache-aside pattern keeps the redirect path fast, how analytics are written without touching the response latency, and how the rate limiter behaves when Redis goes down.

### The redirect path and cache-aside

The redirect endpoint — `GET /:code` — is the service's hot path. Everything else is a management or analytics concern. The cache-aside pattern is the primary architectural decision that keeps it fast.

When a redirect request arrives, the controller calls `cacheService.getLink(code)`. If Redis returns a hit, the entry is parsed from JSON and used immediately — no database query is needed. The redirect fires and the request is complete in under 5ms for a warm cache.

If Redis returns a miss (either the entry was never written or its 24-hour TTL expired), the controller queries PostgreSQL directly. After confirming the link exists and has not expired, it writes the result into Redis with a fresh 24-hour TTL and then issues the redirect. All subsequent requests for the same code hit Redis.

The cache is **never** written at link creation time. Redis is populated only when the first redirect for a given code arrives. This avoids caching links that are created but never clicked — a realistic scenario for bulk imports or stale aliases.

**Two independent TTLs.** Redis TTL and `expires_at` are separate concepts, and conflating them causes bugs:

- **Redis TTL (24 hours)** — cache freshness. When a Redis entry expires, the next request is a cache miss. The link may still be fully active in PostgreSQL.
- `expires_at` **column** — whether the link is still valid at all. On a cache hit, the controller checks `expiresAt` from the cached JSON *every time*. An expired link returns 410 even if its Redis entry is still live.

This means a link can be cached but expired. The expiry check is in the controller, not in `cacheService`, so the cache layer never needs to understand link semantics.

**Cache invalidation.** The inverse of the cache-aside write is the delete-on-write pattern. When a link's URL or redirect type is updated via `PATCH`, or when it is soft-deleted via `DELETE`, the controller immediately calls `cacheService.deleteLink(code)` after the database write. The next redirect for that code becomes a cache miss, re-populates the cache from the updated row, and subsequent requests are fast again.

The full redirect flow:

```
GET /:code

1. cacheService.getLink(code)
   ├── HIT  → parse JSON
   │          → check expiresAt in cached payload
   │          ├── not expired → res.redirect(302/301)
   │          │                 → [async] write click event + increment click_count
   │          └── expired    → cacheService.deleteLink(code) → return 410
   │
   └── MISS → linkRepository.findByCode(code)
              ├── not found → return 404
              ├── expired   → return 410
              └── found     → cacheService.setLink(code, { ... })
                              → res.redirect(302/301)
                              → [async] write click event + increment click_count
```

---



### Fire-and-forget analytics

Every redirect writes two things: a `clicks` row with full metadata (IP address, user agent, referrer, timestamp), and an increment to the denormalized `click_count` counter on the `links` row. Neither of these should be in the response path.

After `res.redirect()` is called, the response is flushed to the client. The controller then uses `setImmediate()` to schedule the analytics writes in the next iteration of the event loop — outside the request/response cycle entirely:

```js
res.setHeader('Cache-Control', 'no-store');
res.redirect(link.redirectType, link.originalUrl);

setImmediate(() => {
    clickRepository.create({ linkId: link.id, ... })
        .catch(err => logger.error('Async click write failed', { linkId: link.id, error: err.message }));

    linkRepository.incrementClickCount(link.id)
        .catch(err => logger.error('Async click_count increment failed', { linkId: link.id, error: err.message }));
});
```

`setImmediate` is preferred over `process.nextTick` for I/O work because it runs after the current I/O callbacks are drained, giving the redirect response time to flush first. The writes are not awaited; errors are caught and logged but never bubble up to the client. A failed analytics write is an acceptable operational outcome — a failed redirect is not.

**Why a denormalized** `click_count`**?** The `clicks` table is the full event log and grows unboundedly. Doing `SELECT COUNT(*) FROM clicks WHERE link_id = $1` on every stats request gets slower as the log grows. The `click_count` column on `links` is always O(1) to read, regardless of how many click events exist. The tradeoff is that the counter can drift if an async increment fails — accepted in v1 as a rare, minor inaccuracy.

---



### Graceful Redis degradation

Redis is involved in three places: the redirect cache, the rate limiter, and the health check. In all three cases the service is designed to keep working when Redis is unavailable.

**Redirect cache.** `cacheService.js` wraps every ioredis call in a try/catch. On a Redis error, it logs a `warn` and returns `null` — simulating a cache miss. The redirect controller handles `null` the same way it handles any miss: it queries PostgreSQL, issues the redirect, and attempts to write back to Redis (which will also fail silently). The client receives a correct redirect, just without the cache acceleration.

**Rate limiter.** The `rate-limiter.js` middleware uses the `skip` option:

```js
skip: (req) => {
    if (!redis.status || redis.status !== 'ready') {
        logger.warn('Rate limiter skipped — Redis unavailable', { ip: req.ip });
        return true;
    }
    return false;
}
```

When `redis.status` is not `'ready'`, the limiter short-circuits and allows the request. This is a deliberate fail-open policy: being unable to count requests is better than refusing all link creation. The warn log means the condition is still observable.

**Health check.** `GET /health` pings both PostgreSQL and Redis independently and reports each as `"connected"` or `"disconnected"`. If either is unreachable, the response is 503 with the per-service breakdown — an orchestrator or load balancer can act on this. The redirect path, however, does not return 503 on Redis failure; the degraded-but-functional behaviour is intentional.

---



### Rate limiting — fixed window per IP

The `POST /api/v1/links` endpoint is the only one that is rate limited. It uses `express-rate-limit` with a Redis-backed `RedisStore` from `rate-limit-redis`, giving a consistent window across multiple server instances:

```
windowMs:      60 000 ms  (1 minute)
max:           10          (requests per IP per window)
keyGenerator:  req => `rl:create:${req.ip}`
```

The key schema namespaces rate-limit keys under `rl:create:` to avoid collision with link cache keys (`link:{code}`). Redis stores an integer counter with a 60-second TTL. On the 11th request, the limiter's `handler` fires instead of the next middleware:

```json
{
  "code": 429,
  "status": "error",
  "message": "Too many requests. You can create up to 10 links per minute.",
  "data": { "retryAfter": 47 }
}
```

`retryAfter` is the number of seconds until the window resets, calculated from `req.rateLimit.resetTime`. The response also includes `RateLimit-*` standard headers (`standardHeaders: true`, `legacyHeaders: false`).

---



### Short code generation

Auto-generated codes use `nanoid` with a 62-character alphabet (`[A-Za-z0-9]`) and a default length of 7:

```
62^7 = ~3.5 trillion possible codes
```

At that scale, collisions are astronomically rare, but the generator still checks for them. Each attempt queries `linkRepository.findByCode(code)`. If the code is already in use (collision), the loop retries up to `CODE_MAX_RETRIES` times (default: 3) before throwing. In practice, the retry branch exists as a safety net and will almost never execute.

When a custom `alias` is provided in the creation request, `generateUniqueCode` is skipped entirely. The alias is used as the code directly. A standard uniqueness query runs against the database, and a 409 is returned if the alias is already taken.

`code-generator.js` has no Express dependency — it imports only `linkRepository` and `nanoid`. This keeps it independently unit-testable with a mocked repository, without spinning up an Express app.

---



### The validation middleware chain

Validation is centralized in two files: `src/utils/validators/link-validators.js` holds the Joi schemas, and `src/app/middlewares/links-middlewares.js` assembles the middleware arrays per route. Controllers never validate manually.

`handleBadRequests(schema, target)` is a middleware factory in `exception-handler.js` that wraps `schema.validate()`. On failure it calls `next(new UnprocessableEntity('Validation failed.', errors))` with a field-level `errors` array. On success it replaces `req[target]` with Joi's coerced, stripped value so the controller always works with clean data.

For `POST /api/v1/links`, the middleware array is:

```
[handleBadRequests(createLinkSchema), rateLimiter]
```

Validation runs before the rate limiter so that obviously malformed requests (missing URL, bad alias format) are rejected at schema validation without consuming a rate-limit token. Within the schema, the URL field enforces `http(s)://` scheme only, a 2,048-character maximum, and a custom check that rejects self-referential URLs — a URL that starts with `BASE_URL` would create a redirect loop.

The `PATCH` schema uses `Joi.alternatives().try()` for `ttlDays` to allow both positive integers and an explicit `null` (removing the expiry). The `.min(1)` constraint on the schema object itself ensures an empty body is rejected with 422 — at least one field must be provided.

---



## Scripts Reference


| Script              | Command                  | Description                                     |
| ------------------- | ------------------------ | ----------------------------------------------- |
| Start (production)  | `npm start`              | Run with `node`                                 |
| Start (development) | `npm run dev`            | Run with `nodemon` (hot reload)                 |
| Test                | `npm test`               | Run Jest suite (creates and tears down test DB) |
| Test (coverage)     | `npm test -- --coverage` | Run suite with coverage report                  |
| Lint                | `npm run lint`           | ESLint check                                    |
| Lint (fix)          | `npm run lint:fix`       | ESLint auto-fix                                 |
| Format check        | `npm run format:check`   | Prettier check                                  |
| Format (fix)        | `npm run format:fix`     | Prettier auto-fix                               |


