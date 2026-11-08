const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/roleMiddleware')(['admin', 'superadmin']);
const { validateRightsUserId, validateRightsChange } = require('../middleware/rightsValidation');
const { getCatalog, getUserRights, updateUserRights } = require('../controllers/rightsController');

router.get('/rights/modules', auth, requireAdmin, getCatalog);
router.get('/:id/rights', auth, requireAdmin, validateRightsUserId, getUserRights);
router.patch('/:id/rights', auth, requireAdmin, validateRightsUserId, validateRightsChange, updateUserRights);
module.exports = router;
