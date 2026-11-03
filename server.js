// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.status(200).json({
      status: 'OK',
      message: 'Express app scaffold and PostgreSQL pool active!',
      db_timestamp: result.rows[0].now,
    });
  } catch (err) {
    console.error('Health Check Error:', err.message);
    res.status(500).json({ status: 'Error', message: 'Database query failed.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});