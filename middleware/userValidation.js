const roles = ['user', 'admin', 'superadmin'];
const statuses = ['pending', 'active', 'blocked', 'disabled', 'disapproved'];

exports.validateUserMutation = action => (req, res, next) => {
  if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id)) ||
      Number(req.params.id) > 2147483647) {
    return res.status(400).json({ message: 'User ID must be a positive PostgreSQL integer.' });
  }
  const body = req.body === undefined ? {} : req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ message: 'Request body must be a JSON object.' });
  }
  const allowed = action === 'update' ? ['username', 'email', 'role', 'status'] :
    action === 'role' ? ['role'] : [];
  if (Object.keys(body).some(key => !allowed.includes(key))) {
    return res.status(400).json({ message: 'Request contains unsupported fields.' });
  }
  if (action === 'role' && !Object.hasOwn(body, 'role')) {
    return res.status(400).json({ message: 'A role is required.' });
  }
  if (action === 'update' && Object.keys(body).length === 0) {
    return res.status(400).json({ message: 'Provide at least one field to update.' });
  }
  if (Object.hasOwn(body, 'role') && !roles.includes(body.role)) {
    return res.status(400).json({ message: 'Role must be user, admin, or superadmin.' });
  }
  if (Object.hasOwn(body, 'status') && !statuses.includes(body.status)) {
    return res.status(400).json({ message: 'Invalid account status.' });
  }
  for (const [field, limit] of [['username', 50], ['email', 255]]) {
    if (Object.hasOwn(body, field) && (typeof body[field] !== 'string' ||
        !body[field].trim() || body[field].trim().length > limit)) {
      return res.status(400).json({ message: `${field} must be a nonempty string of at most ${limit} characters.` });
    }
  }
  if (body.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return res.status(400).json({ message: 'Provide a valid email address.' });
  }
  return next();
};
