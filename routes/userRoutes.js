// routes/userRoutes.js
const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  getUsers,
  createUser,
  updateUser,
  toggleBlockUser,
} = require('../controllers/userController');

// Restrict all /api/users endpoints to admin and superadmin only
const requireAdmin = roleMiddleware(['admin', 'superadmin']);

// GET /api/users - List users (Superadmin accounts hidden from Admin)
router.get('/', authMiddleware, requireAdmin, getUsers);

// POST /api/users - Create new user (Admin can only create 'user')
router.post('/', authMiddleware, requireAdmin, createUser);

// PUT /api/users/:id - Edit user details
router.put('/:id', authMiddleware, requireAdmin, updateUser);

// PATCH /api/users/:id/block - Block or unblock a user (self-block prevented)
router.patch('/:id/block', authMiddleware, requireAdmin, toggleBlockUser);

module.exports = router;

