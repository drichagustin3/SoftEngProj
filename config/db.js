// config/db.js
const { Pool } = require('pg');
const { getDatabaseOptions } = require('./database');
require('dotenv').config();

const pool = new Pool(getDatabaseOptions(process.env));

// Idle clients can emit errors outside an individual query's promise.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

// Test connection on startup without terminating the pool
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to PostgreSQL pool:', err.stack);
  } else {
    console.log('Successfully connected to PostgreSQL database pool!');
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
