// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  forgotPassword, 
  resetPassword 
} = require('../controllers/authController');

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// S1-DEV-04: Password Reset Routes
// POST /api/auth/forgot-password (User submits email to request a reset link)
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password (User submits new password with the token from the link)
router.post('/reset-password', resetPassword);

module.exports = router;


