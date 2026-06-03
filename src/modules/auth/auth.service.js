const AppError = require("../../errors/AppError");
const usersRepository = require("../users/users.repository");
const { comparePassword } = require("../../utils/password");
const { signAccessToken } = require("../../utils/jwt");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");
const { validateLogin } = require("../../validators/auth.validator");

async function login({ email, password }) {
  const validationErrors = validateLogin({
    email,
    password,
  });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await usersRepository.findByEmail(normalizedEmail);

  if (!user) {
    await safeRegisterAuditLog({
      action: "LOGIN_FAILED",
      entity: "auth",
      entityId: null,
      actorId: null,
      metadata: {
        reason: "USER_NOT_FOUND",
      },
    });

    throw new AppError("Invalid email or password", 401);
  }

  if (!user.is_active) {
    await safeRegisterAuditLog({
      action: "LOGIN_FAILED",
      entity: "auth",
      entityId: user.id,
      actorId: user.id,
      metadata: {
        reason: "USER_INACTIVE",
        email: user.email,
      },
    });

    throw new AppError("User is inactive", 403);
  }

  const passwordMatches = await comparePassword(password, user.password_hash);

  if (!passwordMatches) {
    await safeRegisterAuditLog({
      action: "LOGIN_FAILED",
      entity: "auth",
      entityId: user.id,
      actorId: user.id,
      metadata: {
        reason: "INVALID_PASSWORD",
        email: user.email,
      },
    });

    throw new AppError("Invalid email or password", 401);
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department_id: user.department_id,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };

  const accessToken = signAccessToken(safeUser);

  await safeRegisterAuditLog({
    action: "LOGIN_SUCCESS",
    entity: "auth",
    entityId: user.id,
    actorId: user.id,
    metadata: {
      email: user.email,
      role: user.role,
    },
  });

  return {
    user: safeUser,
    accessToken,
  };
}

module.exports = {
  login,
};
