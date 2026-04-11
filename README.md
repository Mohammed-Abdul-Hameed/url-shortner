# URL Shortener

Production-style URL shortener API built with Node.js, Express, PostgreSQL, and Redis.

## Project Readiness

This project is **portfolio-demo ready**, but it is **not production-ready yet**.

What is working well:
- Core REST API endpoints are implemented.
- PostgreSQL stores URL records and click counts.
- Redis is used for URL caching and API rate limiting.
- Docker Compose provides local Postgres and Redis infrastructure.
- Manual curl verification passes for health checks, shortening, lookup, redirect, stats, validation errors, not-found cases, and rate limiting.

What keeps it from being production-ready:
- Automated tests are not implemented yet.
- Some local URL generation and rate-limit edge cases need cleanup.
- Observability, deployment hardening, CI, and security controls are still minimal.

## Run Locally

1. Start infrastructure:

```bash
docker compose up -d
```

2. Use environment values that match `docker-compose.yml`:

```bash
PORT=3000
DB_HOST=localhost
DB_PORT=5433
DB_NAME=urlshortener
DB_USER=urluser
DB_PASSWORD=urlshortener_dev_password
REDIS_HOST=localhost
REDIS_PORT=6379
RATE_LIMIT=10
ID_LENGTH=8
```

Docker maps PostgreSQL from container port `5432` to host port `5433`. Because the Node.js app runs on the host during local development, use `DB_PORT=5433` in `.env`.

3. Install dependencies and start the app:

```bash
npm install
npm start
```

The API should be available at `http://localhost:3000`.

## System Design

### High-Level Architecture

```text
Client
  |
  v
Express API (`src/app.js`)
  |
  +--> API Routes (`/api/*`)
  |      |
  |      +--> Rate Limiter Middleware
  |      |      |
  |      |      +--> Redis
  |      |
  |      +--> URL Service
  |             |
  |             +--> PostgreSQL
  |             +--> Redis Cache
  |
  +--> Redirect Route (`/:shortCode`)
         |
         +--> URL Service
                |
                +--> Redis Cache
                +--> PostgreSQL
```

### Components

- `Express API`: Exposes the HTTP endpoints, parses JSON requests, and handles redirects and errors.
- `PostgreSQL`: Stores URL records permanently with `short_code`, `original_url`, `created_at`, and `click_count`.
- `Redis`: Stores cached short-code mappings and rate-limit counters.
- `URL Service`: Contains the core business logic for shortening URLs, resolving short codes, incrementing clicks, and fetching stats.
- `ID Generator`: Creates collision-safe alphanumeric short codes using `nanoid` with a database existence check and retry logic.

### Core Request Flows

#### 1. Shorten URL Flow

1. Client sends `POST /api/shorten` with a URL.
2. Rate limiter checks the client IP in Redis.
3. The service validates the URL format.
4. PostgreSQL is checked to see if the original URL already exists.
5. If it exists, the existing short code is returned.
6. If it does not exist, a new short code is generated and inserted into PostgreSQL.
7. The short-code-to-URL mapping is cached in Redis.
8. The API returns the generated short URL payload.

#### 2. Redirect Flow

1. Client requests `GET /:shortCode`.
2. The app validates the short code format.
3. Redis is checked first for the original URL.
4. On a cache hit, the app redirects immediately and updates click count in PostgreSQL asynchronously.
5. On a cache miss, PostgreSQL is queried.
6. If found, the mapping is cached in Redis, click count is incremented, and the client is redirected.
7. If not found, the API returns `404`.

#### 3. URL Lookup Flow

1. Client requests `GET /api/url/:shortCode`.
2. Rate limiter checks the request in Redis.
3. Redis is checked first for the mapping.
4. If absent, PostgreSQL is queried and the result is cached.
5. The API returns URL metadata, including click count when available from the database response.

### Data Storage

#### PostgreSQL Table

```sql
CREATE TABLE urls (
  id SERIAL PRIMARY KEY,
  short_code VARCHAR(20) UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  click_count INTEGER DEFAULT 0
);
```

#### Redis Keys

- `url:{shortCode}`: Cached short-code to original-URL mapping with TTL.
- `ratelimit:{ip}`: Per-IP request counter for the rate limiter.

### Design Decisions

- `PostgreSQL for persistence`: URL mappings and click counts survive application restarts.
- `Redis for low-latency reads`: Frequently accessed short codes can be resolved without hitting PostgreSQL every time.
- `Redis for distributed rate limiting`: Request counters are maintained outside application memory.
- `Service-layer separation`: Routing, business logic, caching, and database access are separated into focused modules.
- `Collision handling`: The short-code generator checks PostgreSQL for existing codes and retries before using a fallback strategy.

### Scalability Notes

- The app is stateless at the API layer, so multiple app instances can run behind a load balancer.
- Redis reduces database load for hot short codes and rate-limit checks.
- PostgreSQL remains the source of truth for durability and analytics fields such as `click_count`.
- The current redirect path updates click counts directly in PostgreSQL, which is simple and correct for small to medium traffic. For heavier traffic, this could be moved to asynchronous aggregation.

## Latest Verification

Last verified locally: **2026-04-11**.

- `npm test` passes, but it reports `0` tests because no `*.test.js` files exist yet.
- The manual curl suite passed locally against `http://localhost:3000`.
- Docker services required for local verification: PostgreSQL and Redis.
- Confirmed status codes: `200`, `201`, `302`, `400`, `404`, and `429`.

## Automated Test Status

The project currently has a test script:

```bash
npm test
```

At the moment it runs successfully but no `*.test.js` files exist yet, so it reports `0` tests.

## Manual Test Cases

Use these stable curl commands to validate the API behavior from the specification. Replace `<shortCode>` with the value returned from `POST /api/shorten`.

### 1. Health Check

```bash
curl -i http://localhost:3000/health
```

Expected result:
- Status code is `200`.
- Response body contains `status: "ok"`.

### 2. Shorten a Valid URL

```bash
curl -i -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/very/long/path"}'
```

Expected result:
- Status code is `201`.
- Response contains `shortCode`, `shortUrl`, and `originalUrl`.
- `shortCode` is alphanumeric.
- `originalUrl` matches the input URL.

### 3. Reject Missing URL Input

```bash
curl -i -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected result:
- Status code is `400`.
- Response contains `error: "Missing required field"`.

### 4. Reject Invalid URL Format

```bash
curl -i -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url":"not-a-valid-url"}'
```

Expected result:
- Status code is `400`.
- Response contains `error: "Invalid URL"`.

### 5. Lookup an Existing Short URL

First create a short URL, then query it:

```bash
curl -i http://localhost:3000/api/url/<shortCode>
```

Expected result:
- Status code is `200`.
- Response contains the same `shortCode`.
- Response includes the original URL.
- Database-backed responses include `createdAt` and `clickCount`; cached responses may omit those fields until the cache behavior is improved.

### 6. Redirect Using a Short Code

```bash
curl -i http://localhost:3000/<shortCode>
```

Expected result:
- Status code is `302`.
- `Location` header points to the original URL.

### 7. Return 404 for Unknown Short Code

```bash
curl -i http://localhost:3000/api/url/unknown123
```

Expected result:
- Status code is `404`.
- Response contains `error: "Not found"`.

You can also verify redirect failure:

```bash
curl -i http://localhost:3000/unknown123
```

Expected result:
- Status code is `404`.
- Response contains `message: "Short URL not found"`.

### 8. Reject Invalid Redirect Code Format

```bash
curl -i http://localhost:3000/bad-code!
```

Expected result:
- Status code is `400`.
- Response contains `error: "Invalid short code"`.

### 9. Verify Rate Limiting

Send more than `10` API requests within one minute from the same client:

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/stats
done
```

Expected result:
- Early requests return `200`.
- Requests after the configured limit return `429`.
- The `429` response includes `retryAfter`.

### 10. Verify Stats Endpoint

```bash
curl -i http://localhost:3000/api/stats
```

Expected result:
- Status code is `200`.
- Response includes `totalUrls`, `totalClicks`, and `latestUrl`.

### 11. Verify Click Count Increases

1. Create a short URL.
2. Call the redirect endpoint for that short code one or more times.
3. Fetch the record with `GET /api/url/<shortCode>`.

Example redirect call:

```bash
curl -i http://localhost:3000/<shortCode>
```

Expected result:
- `clickCount` increases after redirect requests when the lookup response is served from PostgreSQL.
- Current cached lookup responses may omit `clickCount`; see Known Issues.

## API Summary

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/shorten` | Create a short URL |
| `GET` | `/api/url/:shortCode` | Fetch URL details |
| `GET` | `/:shortCode` | Redirect to the original URL |
| `GET` | `/api/stats` | Fetch service stats |
| `GET` | `/health` | Health check |

## Known Issues

- `shortUrl` can produce `https://localhost:3000/...` during local runs when `PORT` is loaded as a string. The expected local URL should use `http`.
- With `RATE_LIMIT=10`, the first `429` currently appears on the 12th API request, so the rate-limit check likely has an off-by-one issue.
- Cached `GET /api/url/:shortCode` responses may omit `createdAt` and `clickCount` because Redis stores only the original URL.
- `npm test` succeeds only because there are no test files yet; real automated coverage still needs to be added.
- `.env.example` uses the container Postgres port `5432`, while Docker Compose exposes Postgres to the host on `5433`. Use `DB_PORT=5433` when running the app locally outside Docker.
