const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Pool } = require('pg');
const { getDatabaseOptions } = require('../config/database');

async function main() {
  const pool = new Pool(getDatabaseOptions());
  pool.on('error', err => console.error('Database connection error:', err.message));
  try {
    const result = await pool.query(
      'SELECT current_database() AS database, current_user AS username, version() AS version'
    );
    console.log('PostgreSQL connection successful.');
    console.log(JSON.stringify(result.rows[0], null, 2));
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Database check failed:', err.message);
  process.exitCode = 1;
});
