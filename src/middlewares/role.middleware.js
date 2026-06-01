const AppError = require("../errors/AppError");

function roleMiddleware(allowedRoles = []) {
  return function (req, res, next) {
    if (!req.user) {
      return next(new AppError("Authenticated user is required", 401));
    }

    if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
      return next(new AppError("Allowed roles must be configured", 500));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission to access this resource", 403)
      );
    }

    return next();
  };
}

module.exports = roleMiddleware;
