const validUrl = require('valid-url');
const { query } = require('../db/postgres');
const { generateShortCode } = require('./idGenerator');
const cacheService = require('./cacheService');
const config = require('../config/config');

/**
 * Validate URL
 */
function isValidUrl(url) {
  return validUrl.isUri(url);
}

/**
 * Shorten a URL
 */
async function shortenUrl(originalUrl) {
  // Validate URL
  if (!isValidUrl(originalUrl)) {
    throw new Error('Invalid URL format');
  }

  // Check if URL already exists
  const existing = await query(
    'SELECT short_code FROM urls WHERE original_url = $1',
    [originalUrl]
  );

  if (existing.rows.length > 0) {
    const shortCode = existing.rows[0].short_code;
    await cacheService.cacheUrl(shortCode, originalUrl);
    return {
      shortCode,
      shortUrl: `${config.port !== 3000 ? 'https' : 'http'}://localhost:${config.port}/${shortCode}`,
      originalUrl,
    };
  }

  // Generate unique short code
  const shortCode = await generateShortCode();

  // Insert into database
  const result = await query(
    'INSERT INTO urls (short_code, original_url) VALUES ($1, $2) RETURNING short_code, original_url, created_at',
    [shortCode, originalUrl]
  );

  // Cache the URL
  await cacheService.cacheUrl(shortCode, originalUrl);

  return {
    shortCode: result.rows[0].short_code,
    shortUrl: `${config.port !== 3000 ? 'https' : 'http'}://localhost:${config.port}/${result.rows[0].short_code}`,
    originalUrl: result.rows[0].original_url,
  };
}

/**
 * Get URL by short code
 */
async function getUrlByCode(shortCode) {
  // Check cache first
  const cached = await cacheService.getCachedUrl(shortCode);
  if (cached) {
    return {
      shortCode,
      originalUrl: cached,
      fromCache: true,
    };
  }

  // Query database
  const result = await query(
    'SELECT short_code, original_url, created_at, click_count FROM urls WHERE short_code = $1',
    [shortCode]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const url = result.rows[0];

  // Cache for future requests
  await cacheService.cacheUrl(shortCode, url.original_url);

  return {
    shortCode: url.short_code,
    originalUrl: url.original_url,
    createdAt: url.created_at,
    clickCount: url.click_count,
    fromCache: false,
  };
}

/**
 * Redirect and increment click count
 */
async function redirectUrl(shortCode) {
  // Try cache first
  const cached = await cacheService.getCachedUrl(shortCode);

  if (cached) {
    // Increment click count in background (fire and forget for performance)
    query('UPDATE urls SET click_count = click_count + 1 WHERE short_code = $1', [shortCode])
      .catch(() => {}); // Ignore errors
    return cached;
  }

  // Query database
  const result = await query(
    'SELECT original_url FROM urls WHERE short_code = $1',
    [shortCode]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const originalUrl = result.rows[0].original_url;

  // Cache the URL
  await cacheService.cacheUrl(shortCode, originalUrl);

  // Increment click count
  await query(
    'UPDATE urls SET click_count = click_count + 1 WHERE short_code = $1',
    [shortCode]
  );

  return originalUrl;
}

/**
 * Get overall stats
 */
async function getStats() {
  const result = await query(`
    SELECT
      COUNT(*) as total_urls,
      SUM(click_count) as total_clicks,
      MAX(created_at) as latest_url
    FROM urls
  `);

  const stats = result.rows[0];
  return {
    totalUrls: parseInt(stats.total_urls) || 0,
    totalClicks: parseInt(stats.total_clicks) || 0,
    latestUrl: stats.latest_url,
  };
}

module.exports = {
  shortenUrl,
  getUrlByCode,
  redirectUrl,
  getStats,
  isValidUrl,
};