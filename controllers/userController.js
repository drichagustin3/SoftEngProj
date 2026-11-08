// controllers/userController.js
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// ============================================================================
// 1. GET /api/users
// - Superadmin sees ALL users.
// - Admin sees Users and Admins, but Superadmins are completely HIDDEN.
// ============================================================================
exports.getUsers = async (req, res) => {
  const callerRole = req.user.role;

  try {
    let queryText = `
      SELECT user_id, username, email, role, status, is_blocked, created_at 
      FROM app_user
    `;
    const queryParams = [];

    // Business Rule [S1-DEV-05]: Admin cannot see Superadmin accounts
    if (callerRole === 'admin') {
      queryText += " WHERE role != 'superadmin'";
    }

    queryText += ' ORDER BY user_id ASC';

    const result = await db.query(queryText, queryParams);

    return res.status(200).json({
      success: true,
      count: result.rowCount,
      users: result.rows,
    });
  } catch (err) {
    console.error('Error fetching users:', err.message);
    return res.status(500).json({ message: 'Server error fetching user list.' });
  }
};

// ============================================================================
// 2. POST /api/users
// - Admin can ONLY create 'user' accounts.
// - Superadmin can create 'admin' or 'user' accounts.
// ============================================================================
exports.createUser = async (req, res) => {
  const callerRole = req.user.role;
  const { username, email, password, role = 'user' } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required.' });
  }

  // Business Rule [S1-DEV-05]: Admins can only create regular 'user' accounts
  if (callerRole === 'admin' && role !== 'user') {
    return res.status(403).json({
      message: 'Access Denied: Admins can only create User accounts. Only Superadmins can assign Admin roles.',
    });
  }

  try {
    // 1. Check for duplicates
    const existing = await db.query(
      'SELECT * FROM app_user WHERE email = $1 OR username = $2',
      [email.trim().toLowerCase(), username.trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Username or email already exists.' });
    }

    // 2. Hash initial password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Insert new user
    const result = await db.query(
      `INSERT INTO app_user (username, email, password_hash, role, status, is_blocked)
       VALUES ($1, $2, $3, $4, 'active', FALSE)
       RETURNING user_id, username, email, role, status, is_blocked, created_at`,
      [username.trim(), email.trim().toLowerCase(), passwordHash, role]
    );

    return res.status(201).json({
      message: 'User created successfully.',
      user: result.rows[0],
    });
  } catch (err) {
    console.error('Error creating user:', err.message);
    return res.status(500).json({ message: 'Server error creating user.' });
  }
};

// S1-DEV-06: all user mutations share transactional authorization and safety checks.
const { mutateUser } = require('../services/userManagement');

const mutationHandler = action => async (req, res) => {
  try {
    const user = await mutateUser(req.user.userId, Number(req.params.id), action, req.body || {});
    return res.status(200).json({
      message: {
        approve: 'User approved successfully.',
        role: 'User role updated successfully.',
        update: 'User updated successfully.',
        block: 'User block status updated successfully.',
        delete: 'User removed successfully.',
      }[action],
      user,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Username or email already exists.' });
    }
    console.error('User management error:', err.message);
    return res.status(500).json({ message: 'Server error updating user.' });
  }
};

exports.updateUser = mutationHandler('update');
exports.toggleBlockUser = mutationHandler('block');
exports.approveUser = mutationHandler('approve');
exports.updateUserRole = mutationHandler('role');
exports.deleteUser = mutationHandler('delete');
