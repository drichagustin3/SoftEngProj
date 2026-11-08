const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const token = authorization.slice(7);

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        return next();
    } catch (err) {
        return res.status(403).json({ message: 'Invalid or expired token.' });
    }
};