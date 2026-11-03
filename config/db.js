// config/db.js
const { Pool } = require('pg');
require('dotenv').config();

// Create a reusable connection pool using environment variables
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10, // Maximum active database clients allowed in pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Timeout request after 2 seconds if connection fails
});

// Verify connection pool on initialization
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error connecting to PostgreSQL pool:', err.stack);
  }
  console.log('Successfully connected to PostgreSQL database pool!');
  release(); // Return client back to pool
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};