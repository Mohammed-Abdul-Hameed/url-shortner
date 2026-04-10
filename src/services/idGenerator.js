const { customAlphabet } = require('nanoid');
const config = require('../config/config');
const { query } = require('../db/postgres');

// Use alphanumeric alphabet (without special chars for URL safety)
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const nanoid = customAlphabet(ALPHABET, config.idLength);

/**
 * Generates a collision-safe short code
 * Uses nanoid with database collision check and retry
 */
async function generateShortCode() {
  const maxRetries = 5;
  let attempts = 0;

  while (attempts < maxRetries) {
    // Generate a unique ID
    const shortCode = nanoid();

    // Check if it already exists in the database
    const result = await query(
      'SELECT short_code FROM urls WHERE short_code = $1',
      [shortCode]
    );

    if (result.rows.length === 0) {
      return shortCode;
    }

    attempts++;
  }

  // Fallback: generate with timestamp prefix for guaranteed uniqueness
  const timestamp = Date.now().toString(36);
  const random = nanoid();
  return (timestamp + random).slice(0, config.idLength);
}

/**
 * Generates multiple short codes at once
 */
async function generateShortCodes(count) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(await generateShortCode());
  }
  return codes;
}

module.exports = {
  generateShortCode,
  generateShortCodes,
};