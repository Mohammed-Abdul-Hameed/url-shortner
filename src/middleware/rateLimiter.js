const cacheService = require('../services/cacheService');
const config = require('../config/config');

/**
 * Rate limiting middleware
 */
async function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  // Check if rate limited
  const isLimited = await cacheService.isRateLimited(ip);

  if (isLimited) {
    const info = await cacheService.getRateLimitInfo(ip);
    return res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${info.reset} seconds.`,
      retryAfter: info.reset,
    });
  }

  // Increment counter
  await cacheService.incrementRateLimit(ip);

  // Add rate limit headers
  const info = await cacheService.getRateLimitInfo(ip);
  res.set({
    'X-RateLimit-Limit': info.limit,
    'X-RateLimit-Remaining': info.remaining,
    'X-RateLimit-Reset': info.reset,
  });

  next();
}

module.exports = rateLimiter;