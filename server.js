// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { pool } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const authMiddleware = require('./middleware/authMiddleware');
const roleMiddleware = require('./middleware/roleMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes: S1 Auth & Password Reset [S1-DEV-01 - S1-DEV-04]
app.use('/api/auth', authRoutes);

// Protected test route [S1-DEV-03]
app.get('/api/users/me', authMiddleware, (req, res) => {
  res.status(200).json({
    message: 'Protected route accessed successfully!',
    user: req.user,
  });
});

// Routes: S1 User Management [S1-DEV-05]
app.use('/api/users', userRoutes);

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
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

const requireEmployeeReader = roleMiddleware(['user', 'admin', 'superadmin']);
const requireEmployeeAdmin = roleMiddleware(['admin', 'superadmin']);

// ----------------------------------------------------------------------------
// GET /api/employees
// - 'user' role -> Reads from employee_active view (non-deleted rows only)
// - 'admin' / 'superadmin' -> Reads from employee table with filters
// ----------------------------------------------------------------------------
app.get('/api/employees', authMiddleware, requireEmployeeReader, async (req, res) => {
  const userRole = req.user.role;
  const statusFilter = req.query.status || 'active'; // 'active' | 'inactive' | 'all'

  try {
    let queryText = 'SELECT * FROM employee';
    let queryParams = [];

    if (userRole === 'user') {
      queryText = 'SELECT * FROM employee_active';
    } else {
      if (statusFilter === 'active') {
        queryText += ' WHERE NOT is_deleted';
      } else if (statusFilter === 'inactive') {
        queryText += ' WHERE is_deleted';
      }
    }

    const result = await pool.query(queryText, queryParams);
    res.json({
      role: userRole,
      count: result.rowCount,
      data: result.rows
    });
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// DELETE /api/employees/:empno
// Soft deletes an employee (SET is_deleted = TRUE)
// Uses SET LOCAL app.username so PostgreSQL triggers record the stamp & audit_log
// ----------------------------------------------------------------------------
app.delete('/api/employees/:empno', authMiddleware, requireEmployeeAdmin, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Set app.username so database triggers record audit_stamp and audit_log
    await client.query("SELECT set_config('app.username', $1, true)", [req.user.username]);

    const { empno } = req.params;
    const result = await client.query(
      'UPDATE employee SET is_deleted = TRUE WHERE empno = $1 RETURNING *',
      [empno]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `Employee ${empno} not found.` });
    }

    await client.query('COMMIT');
    res.json({
      message: `Employee ${empno} soft-deleted successfully.`,
      data: result.rows[0]
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        client.release(rollbackError);
        client = null;
        console.error('Employee rollback failed:', rollbackError.message);
      }
    }
    console.error('Error soft-deleting employee:', err);
    res.status(500).json({ error: 'Unable to soft-delete employee.' });
  } finally {
    if (client) client.release();
  }
});

// ----------------------------------------------------------------------------
// POST /api/employees/:empno/restore
// Restores a soft-deleted employee (SET is_deleted = FALSE) [Admin only]
// ----------------------------------------------------------------------------
app.post('/api/employees/:empno/restore', authMiddleware, requireEmployeeAdmin, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Set app.username for PostgreSQL audit triggers
    await client.query("SELECT set_config('app.username', $1, true)", [req.user.username]);

    const { empno } = req.params;
    const result = await client.query(
      'UPDATE employee SET is_deleted = FALSE WHERE empno = $1 RETURNING *',
      [empno]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `Employee ${empno} not found.` });
    }

    await client.query('COMMIT');
    res.json({
      message: `Employee ${empno} restored successfully.`,
      data: result.rows[0]
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        client.release(rollbackError);
        client = null;
        console.error('Employee rollback failed:', rollbackError.message);
      }
    }
    console.error('Error restoring employee:', err);
    res.status(500).json({ error: 'Unable to restore employee.' });
  } finally {
    if (client) client.release();
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`[BACKEND SERVER] Running on http://localhost:${PORT}`);
});
