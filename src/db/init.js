const { Pool } = require('pg');
const config = require('../config/config');

async function initDatabase() {
  // First connect without database to create it
  const adminPool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: 'postgres',
    user: config.db.user,
    password: config.db.password,
  });

  try {
    // Check if database exists
    const dbCheck = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [config.db.database]
    );

    if (dbCheck.rows.length === 0) {
      await adminPool.query(`CREATE DATABASE ${config.db.database}`);
      console.log(`Database ${config.db.database} created`);
    }
  } finally {
    await adminPool.end();
  }

  // Now connect to the actual database and create tables
  const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS urls (
        id SERIAL PRIMARY KEY,
        short_code VARCHAR(20) UNIQUE NOT NULL,
        original_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        click_count INTEGER DEFAULT 0
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_short_code ON urls(short_code)
    `);

    console.log('Database tables initialized');
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('Initialization complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Initialization failed:', err);
      process.exit(1);
    });
}

module.exports = { initDatabase };