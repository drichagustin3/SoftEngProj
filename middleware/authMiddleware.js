const jwt = require('jsonwebtoken');
const db = require('../config/db');

module.exports = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  // Extract token, trim whitespace, and strip any accidental quotes copied from JSON
  const token = authorization.slice(7).trim().replace(/^["']|["']$/g, '');

  let payload;
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Authentication is not configured.' });
    }
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!Number.isSafeInteger(payload.userId) || payload.userId <= 0) {
      return res.status(403).json({ message: 'Invalid token identity.' });
    }
  } catch (err) {
    console.error('JWT Verification Error:', err.message);
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }

  try {
    const result = await db.query(
      'SELECT user_id, username, role, status, is_blocked FROM app_user WHERE user_id = $1',
      [payload.userId]
    );
    const user = result.rows[0];
    if (!user || user.status !== 'active' || user.is_blocked) {
      return res.status(403).json({ message: 'Access denied. An active account is required.' });
    }
    // Database state supersedes stale role and username claims in existing JWTs.
    req.user = { userId: user.user_id, username: user.username, role: user.role };
  } catch (err) {
    console.error('Account verification error:', err.message);
    return res.status(503).json({ message: 'Unable to verify account. Please try again later.' });
  }
  return next();
};
