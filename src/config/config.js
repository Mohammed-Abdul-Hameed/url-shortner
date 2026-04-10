require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'urlshortener',
    user: process.env.DB_USER || 'urluser',
    password: process.env.DB_PASSWORD || 'urlpass123',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
  rateLimit: {
    maxRequests: parseInt(process.env.RATE_LIMIT) || 10,
    windowMs: 60 * 1000, // 1 minute
  },
  idLength: parseInt(process.env.ID_LENGTH) || 8,
  cache: {
    urlTtl: 3600, // 1 hour in seconds
  },
};