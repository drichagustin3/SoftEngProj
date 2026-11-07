const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  // Extract token, trim whitespace, and strip any accidental quotes copied from JSON
  const token = authorization.slice(7).trim().replace(/^["']|["']$/g, '');

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    return next();
  } catch (err) {
    console.error('JWT Verification Error:', err.message);
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
};
