const { getRights, saveRights } = require('../services/rightsManagement');
const { modules } = require('../config/rights');

exports.getCatalog = (req, res) => res.json({ modules });
const handle = write => async (req, res) => {
  try {
    const rights = write
      ? await saveRights(req.user.userId, Number(req.params.id), req.rightsChanges)
      : await getRights(req.user.userId, Number(req.params.id));
    return res.json({ ...(write ? { message: 'Rights saved successfully.' } : {}), ...rights });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('Rights management error:', err.message);
    return res.status(500).json({ message: 'Unable to process user rights.' });
  }
};
exports.getUserRights = handle(false);
exports.updateUserRights = handle(true);
