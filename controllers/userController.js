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

// ============================================================================
// 3. PUT /api/users/:id
// - Update user details (username, email, role, status).
// - Admins CANNOT edit Superadmin accounts.
// - Admins CANNOT promote someone to Admin or Superadmin.
// ============================================================================
exports.updateUser = async (req, res) => {
  const callerRole = req.user.role;
  const targetId = parseInt(req.params.id, 10);
  const { username, email, role, status } = req.body || {};

  if (isNaN(targetId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }

  try {
    // 1. Fetch the user being edited
    const targetResult = await db.query('SELECT * FROM app_user WHERE user_id = $1', [targetId]);
    if (targetResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const targetUser = targetResult.rows[0];

    // Business Rule [S1-DEV-05]: Admin cannot modify Superadmin accounts
    if (callerRole === 'admin' && targetUser.role === 'superadmin') {
      return res.status(403).json({ message: 'Access Denied: Admins cannot modify Superadmin accounts.' });
    }

    // Business Rule [S1-DEV-05]: Admin cannot promote accounts to Admin or Superadmin
    if (callerRole === 'admin' && role && role !== 'user') {
      return res.status(403).json({ message: 'Access Denied: Admins cannot promote users to Admin or Superadmin.' });
    }

    // Determine final values (retain existing if not supplied)
    const newUsername = username ? username.trim() : targetUser.username;
    const newEmail = email ? email.trim().toLowerCase() : targetUser.email;
    const newRole = (callerRole === 'superadmin' && role) ? role : targetUser.role;
    const newStatus = status ? status : targetUser.status;

    const updateResult = await db.query(
      `UPDATE app_user 
       SET username = $1, email = $2, role = $3, status = $4
       WHERE user_id = $5
       RETURNING user_id, username, email, role, status, is_blocked, created_at`,
      [newUsername, newEmail, newRole, newStatus, targetId]
    );

    return res.status(200).json({
      message: 'User updated successfully.',
      user: updateResult.rows[0],
    });
  } catch (err) {
    console.error('Error updating user:', err.message);
    return res.status(500).json({ message: 'Server error updating user.' });
  }
};

// ============================================================================
// 4. PATCH /api/users/:id/block
// - Toggles is_blocked flag (and updates status to 'blocked' or 'active').
// - Self-block guard: A user CANNOT block their own account!
// - Admin guard: Admin cannot block another Admin or Superadmin.
// ============================================================================
exports.toggleBlockUser = async (req, res) => {
  const callerId = req.user.userId;
  const callerRole = req.user.role;
  const targetId = parseInt(req.params.id, 10);

  if (isNaN(targetId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }

  // Safety Guard: Cannot block yourself!
  if (callerId === targetId) {
    return res.status(400).json({ message: 'Action Denied: You cannot block your own account.' });
  }

  try {
    const targetResult = await db.query('SELECT * FROM app_user WHERE user_id = $1', [targetId]);
    if (targetResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const targetUser = targetResult.rows[0];

    // Business Rule [S1-DEV-05]: Admin cannot block Admins or Superadmins
    if (callerRole === 'admin' && (targetUser.role === 'admin' || targetUser.role === 'superadmin')) {
      return res.status(403).json({ message: 'Access Denied: Admins can only block regular Users.' });
    }

    // Toggle block status: if currently blocked, unblock; if unblocked, block
    const newBlockedState = !targetUser.is_blocked;
    const newStatus = newBlockedState ? 'blocked' : 'active';

    const result = await db.query(
      `UPDATE app_user 
       SET is_blocked = $1, status = $2
       WHERE user_id = $3
       RETURNING user_id, username, email, role, status, is_blocked`,
      [newBlockedState, newStatus, targetId]
    );

    const actionWord = newBlockedState ? 'blocked' : 'unblocked';
    return res.status(200).json({
      message: `User ${targetUser.username} has been ${actionWord} successfully.`,
      user: result.rows[0],
    });
  } catch (err) {
    console.error('Error toggling block status:', err.message);
    return res.status(500).json({ message: 'Server error updating user block status.' });
  }
};

