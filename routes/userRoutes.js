// routes/userRoutes.js
const express = require('express');
const router = express.Router();
router.use(require('./rightsRoutes'));

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { validateUserMutation } = require('../middleware/userValidation');
const {
  getUsers,
  createUser,
  updateUser,
  toggleBlockUser,
  approveUser,
  updateUserRole,
  deleteUser,
} = require('../controllers/userController');

// Restrict all /api/users endpoints to admin and superadmin only
const requireAdmin = roleMiddleware(['admin', 'superadmin']);
const requireSuperadmin = roleMiddleware(['superadmin']);

router.patch('/:id/approve', authMiddleware, requireSuperadmin, validateUserMutation('approve'), approveUser);
router.patch('/:id/role', authMiddleware, requireSuperadmin, validateUserMutation('role'), updateUserRole);
router.delete('/:id', authMiddleware, requireSuperadmin, validateUserMutation('delete'), deleteUser);

// GET /api/users - List users (Superadmin accounts hidden from Admin)
router.get('/', authMiddleware, requireAdmin, getUsers);

// POST /api/users - Create new user (Admin can only create 'user')
router.post('/', authMiddleware, requireAdmin, createUser);

// PUT /api/users/:id - Edit user details
router.put('/:id', authMiddleware, requireAdmin, validateUserMutation('update'), updateUser);

// PATCH /api/users/:id/block - Block or unblock a user (self-block prevented)
router.patch('/:id/block', authMiddleware, requireAdmin, validateUserMutation('block'), toggleBlockUser);

module.exports = router;

