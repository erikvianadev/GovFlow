const AppError = require('../errors/AppError');

function notFoundMiddleware(req, res, next) {
  return next(new AppError(`Route ${req.originalUrl} not found`, 404));
}

module.exports = notFoundMiddleware;