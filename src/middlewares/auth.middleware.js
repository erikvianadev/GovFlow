const AppError = require("../errors/AppError");
const { verifyAccessToken } = require("../utils/jwt");
const usersRepository = require("../modules/users/users.repository");
const { validateUserId } = require("../validators/users.validator");

async function authMiddleware(req, res, next) {
  try {
    const authorizationHeader = req.headers.authorization;

    if (!authorizationHeader) {
      throw new AppError("Authentication token is required", 401);
    }

    const authorizationParts = authorizationHeader.split(" ");

    if (
      authorizationParts.length !== 2 ||
      authorizationParts[0] !== "Bearer" ||
      !authorizationParts[1]
    ) {
      throw new AppError("Invalid authentication token format", 401);
    }

    const token = authorizationParts[1];
    let decodedToken;

    try {
      decodedToken = verifyAccessToken(token);
    } catch (error) {
      throw new AppError("Invalid or expired authentication token", 401);
    }

    if (validateUserId(decodedToken.sub).length > 0) {
      throw new AppError("Invalid or expired authentication token", 401);
    }

    const user = await usersRepository.findById(decodedToken.sub);

    if (!user) {
      throw new AppError("Authenticated user not found", 401);
    }

    if (!user.is_active) {
      throw new AppError("User is inactive", 403);
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department_id: user.department_id,
      is_active: user.is_active,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authMiddleware;
