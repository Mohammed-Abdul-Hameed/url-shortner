const express = require('express');
const urlService = require('../services/urlService');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

// Apply rate limiting to all API routes
router.use(rateLimiter);

/**
 * POST /api/shorten
 * Shorten a URL
 */
router.post('/shorten', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'URL is required',
      });
    }

    const result = await urlService.shortenUrl(url);

    res.status(201).json(result);
  } catch (error) {
    if (error.message === 'Invalid URL format') {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'The provided URL is not valid',
      });
    }

    console.error('Error shortening URL:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to shorten URL',
    });
  }
});

/**
 * GET /api/url/:shortCode
 * Get URL info
 */
router.get('/url/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;

    const url = await urlService.getUrlByCode(shortCode);

    if (!url) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Short URL not found',
      });
    }

    res.json({
      shortCode: url.shortCode,
      originalUrl: url.originalUrl,
      createdAt: url.createdAt,
      clickCount: url.clickCount,
      cached: url.fromCache || false,
    });
  } catch (error) {
    console.error('Error getting URL:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get URL',
    });
  }
});

/**
 * GET /api/stats
 * Get overall stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await urlService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get stats',
    });
  }
});

module.exports = router;