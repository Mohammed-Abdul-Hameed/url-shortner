require('dotenv').config();
const express = require('express');
const config = require('./config/config');
const apiRoutes = require('./routes/api');
const urlService = require('./services/urlService');
const cacheService = require('./services/cacheService');
const { initDatabase } = require('./db/init');

const app = express();

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Redirect short URL
app.get('/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;

    // Validate short code format
    if (!/^[a-zA-Z0-9]+$/.test(shortCode)) {
      return res.status(400).json({
        error: 'Invalid short code',
        message: 'Short code contains invalid characters',
      });
    }

    const originalUrl = await urlService.redirectUrl(shortCode);

    if (!originalUrl) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Short URL not found',
      });
    }

    // Redirect to original URL
    res.redirect(originalUrl);
  } catch (error) {
    console.error('Error redirecting:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to redirect',
    });
  }
});

// API routes
app.use('/api', apiRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'Endpoint not found',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred',
  });
});

// Start server
async function start() {
  try {
    // Initialize database
    await initDatabase();

    // Connect to Redis
    await cacheService.connect();

    // Start Express server
    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Rate limit: ${config.rateLimit.maxRequests} requests per minute`);
      console.log(`ID length: ${config.idLength} characters`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await cacheService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await cacheService.disconnect();
  process.exit(0);
});

start();

module.exports = app;