// middleware/roleMiddleware.js

// Middleware factory that accepts a list of allowed roles (e.g. ['admin', 'superadmin'])
module.exports = (allowedRoles = []) => {
  return (req, res, next) => {
    // 1. Ensure user is already authenticated (authMiddleware must run first)
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    // 2. Check if the user's role is in the allowed list
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Access Denied: You do not have permission to access this resource.',
      });
    }

    // 3. User has permission, proceed to the controller
    next();
  };
};

