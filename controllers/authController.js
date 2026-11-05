// controllers/authController.js
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Registration API Logic
exports.register = async (req, res) => {
  const { username, email, password } = req.body || {};

  // Basic Validation
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Please provide username, email, and password.' });
  }

  try {
    // 1. Check if user already exists
    const userCheck = await db.query(
      'SELECT * FROM app_user WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Username or email already exists.' });
    }

    // 2. Hash password securely
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Insert user into database (defaults: role = 'user', status = 'pending')
    const newUser = await db.query(
      'INSERT INTO app_user (username, email, password_hash) VALUES ($1, $2, $3) RETURNING user_id, username, email, role, status, created_at',
      [username, email, passwordHash]
    );

    return res.status(201).json({
      message: 'User registered successfully! Account is pending administrator approval.',
      user: newUser.rows[0],
    });
  } catch (err) {
    console.error('Registration Error:', err.message);
    return res.status(500).json({ message: 'Server error during registration.' });
  }
};

// Login API Logic
exports.login = async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide email and password.' });
  }

  try {
    const userResult = await db.query('SELECT * FROM app_user WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const user = userResult.rows[0];

    // Check if account is blocked or pending approval [S1-DEV-03]
    if (user.status === 'blocked' || user.is_blocked) {
      return res.status(403).json({ message: 'This account has been blocked. Contact an administrator.' });
    }
    if (user.status === 'pending') {
      return res.status(403).json({ message: 'Your account is pending administrator approval.' });
    }
    if (user.status === 'disapproved') {
      return res.status(403).json({ message: 'This registration was not approved.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { userId: user.user_id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    return res.status(200).json({
      message: 'Login successful!',
      token,
      user: { id: user.user_id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login Error:', err.message);
    return res.status(500).json({ message: 'Server error during login.' });
  }
};

// ==========================================
// S1-DEV-04: Password Reset Logic
// ==========================================

// 1. Request Password Reset (Generates and stores token)
exports.forgotPassword = async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ message: 'Please provide an email address.' });
  }

  try {
    // Look up user in database
    const userResult = await db.query('SELECT * FROM app_user WHERE email = $1', [email.trim().toLowerCase()]);

    // Security best practice: Always return a generic success message,
    // so attackers cannot guess which emails are registered in the company.
    if (userResult.rows.length === 0) {
      return res.status(200).json({
        message: 'If an account with that email exists, a password reset link has been generated.',
      });
    }

    const user = userResult.rows[0];

    // Step A: Create a secure random token (32 bytes = 64 hexadecimal characters)
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Step B: Hash the token using SHA-256 before saving to database (protects token if DB is leaked)
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Step C: Set expiration time to 1 hour from right now
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Step D: Insert token into the password_reset_token table
    await db.query(
      `INSERT INTO password_reset_token (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.user_id, tokenHash, expiresAt]
    );

    // Step E: Construct the reset link (printed to console for local development & testing)
    const resetUrl = `http://localhost:3000/reset-password?token=${rawToken}`;
    console.log('========================================================');
    console.log(`[PASSWORD RESET REQUEST] for user: ${user.email}`);
    console.log(`Reset Link: ${resetUrl}`);
    console.log('========================================================');

    return res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been generated.',
      devResetUrl: process.env.NODE_ENV !== 'production' ? resetUrl : undefined,
    });
  } catch (err) {
    console.error('Forgot Password Error:', err.message);
    return res.status(500).json({ message: 'Server error processing password reset request.' });
  }
};

// 2. Complete Password Reset (Verifies token and saves new password)
exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body || {};

  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Both the reset token and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters long.' });
  }

  try {
    // Step A: Hash the incoming raw token to look up its hash in the database
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Step B: Check if the token exists, is not expired, and has not been used yet
    const tokenResult = await db.query(
      `SELECT * FROM password_reset_token
       WHERE token_hash = $1
         AND used = FALSE
         AND expires_at > NOW()`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid, expired, or already-used reset token.' });
    }

    const resetRecord = tokenResult.rows[0];

    // Step C: Securely hash the new password using bcrypt
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Step D: Update the user's password in the app_user table
    await db.query(
      'UPDATE app_user SET password_hash = $1 WHERE user_id = $2',
      [newPasswordHash, resetRecord.user_id]
    );

    // Step E: Invalidate the token so it cannot be reused
    await db.query(
      'UPDATE password_reset_token SET used = TRUE WHERE token_id = $1',
      [resetRecord.token_id]
    );

    return res.status(200).json({
      message: 'Password successfully updated! You can now log in with your new password.',
    });
  } catch (err) {
    console.error('Reset Password Error:', err.message);
    return res.status(500).json({ message: 'Server error during password reset.' });
  }
};