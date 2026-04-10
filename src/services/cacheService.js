const { createClient } = require('redis');
const config = require('../config/config');

let client = null;

/**
 * Connect to Redis
 */
async function connect() {
  if (client) return client;

  client = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
  });

  client.on('error', (err) => console.error('Redis Client Error', err));

  await client.connect();
  console.log('Connected to Redis');
  return client;
}

/**
 * Get cached URL
 */
async function getCachedUrl(shortCode) {
  if (!client) await connect();
  const key = `url:${shortCode}`;
  return client.get(key);
}

/**
 * Cache URL mapping
 */
async function cacheUrl(shortCode, originalUrl) {
  if (!client) await connect();
  const key = `url:${shortCode}`;
  await client.setEx(key, config.cache.urlTtl, originalUrl);
}

/**
 * Invalidate cached URL
 */
async function invalidateUrl(shortCode) {
  if (!client) await connect();
  const key = `url:${shortCode}`;
  await client.del(key);
}

/**
 * Get rate limit status for an IP
 */
async function getRateLimit(ip) {
  if (!client) await connect();
  const key = `ratelimit:${ip}`;
  const count = await client.get(key);
  return parseInt(count) || 0;
}

/**
 * Increment rate limit counter
 */
async function incrementRateLimit(ip) {
  if (!client) await connect();
  const key = `ratelimit:${ip}`;
  const count = await client.incr(key);

  // Set expiry on first request
  if (count === 1) {
    await client.expire(key, Math.ceil(config.rateLimit.windowMs / 1000));
  }

  return count;
}

/**
 * Check if rate limited
 */
async function isRateLimited(ip) {
  const count = await getRateLimit(ip);
  return count > config.rateLimit.maxRequests;
}

/**
 * Get current rate limit info
 */
async function getRateLimitInfo(ip) {
  const count = await getRateLimit(ip);
  const remaining = Math.max(0, config.rateLimit.maxRequests - count);
  const resetTime = Math.ceil(config.rateLimit.windowMs / 1000);
  return {
    limit: config.rateLimit.maxRequests,
    remaining,
    reset: resetTime,
  };
}

/**
 * Disconnect from Redis
 */
async function disconnect() {
  if (client) {
    await client.quit();
    client = null;
  }
}

module.exports = {
  connect,
  disconnect,
  getCachedUrl,
  cacheUrl,
  invalidateUrl,
  getRateLimit,
  incrementRateLimit,
  isRateLimited,
  getRateLimitInfo,
};