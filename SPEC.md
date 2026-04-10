# URL Shortener - Production Grade Specification

## Project Overview
- **Project name**: URL Shortener
- **Type**: REST API Service
- **Core functionality**: Shorten long URLs, redirect short URLs to originals, track usage stats
- **Target users**: Developers and applications needing URL shortening

## Tech Stack
- **Runtime**: Node.js with Express
- **Database**: PostgreSQL (persistent storage)
- **Cache**: Redis (caching + rate limiting)
- **Language**: JavaScript

## Functionality Specification

### Core Features

#### 1. URL Shortening
- POST `/api/shorten` - Create short URL
  - Input: `{ "url": "https://example.com/very/long/path" }`
  - Output: `{ "shortCode": "abc123", "shortUrl": "http://localhost:3000/abc123", "originalUrl": "..." }`
  - Validates URL format
  - Generates collision-safe unique ID

#### 2. URL Redirection
- GET `/:shortCode` - Redirect to original URL
  - Increments click count
  - Caches the mapping in Redis
  - Returns 404 for invalid codes

#### 3. URL Lookup
- GET `/api/url/:shortCode` - Get URL info
  - Returns original URL, creation date, click count

#### 4. Rate Limiting
- Default: 10 requests per minute per IP
- Configurable via environment variables
- Uses Redis for distributed rate limiting

#### 5. Collision-Safe ID Generation
- Uses nanoid-like algorithm with custom encoding
- Format: alphanumeric, 8 characters default
- Collision detection via database unique constraint + retry

### Data Models

#### PostgreSQL - urls table
```sql
CREATE TABLE urls (
  id SERIAL PRIMARY KEY,
  short_code VARCHAR(20) UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  click_count INTEGER DEFAULT 0
);
CREATE INDEX idx_short_code ON urls(short_code);
```

#### Redis Keys
- `url:{shortCode}` - Cached original URL (TTL: 1 hour)
- `ratelimit:{ip}` - Rate limit counter

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/shorten | Shorten a URL |
| GET | /api/url/:shortCode | Get URL info |
| GET | /:shortCode | Redirect to original |
| GET | /api/stats | Get overall stats |

### Environment Variables
- `PORT` - Server port (default: 3000)
- `DB_HOST` - PostgreSQL host
- `DB_PORT` - PostgreSQL port
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `REDIS_HOST` - Redis host
- `REDIS_PORT` - Redis port
- `RATE_LIMIT` - Requests per minute (default: 10)
- `ID_LENGTH` - Short code length (default: 8)

## Docker Setup

### PostgreSQL Container
- Image: postgres:15-alpine
- Volume: pgdata for persistence
- Environment configured via docker-compose

## Acceptance Criteria
1. POST /api/shorten returns valid short code
2. GET /:shortCode redirects correctly
3. Rate limiting blocks excessive requests
4. Redis caching reduces DB load
5. No collisions in ID generation
6. Click counting works
7. All data persists across restarts