const AppError = require("../../errors/AppError");
const usersRepository = require("./users.repository");
const departmentsRepository = require("../departments/departments.repository");
const {
  validateCreateUser,
  validateListUsersFilters,
  validateUserId,
} = require("../../validators/users.validator");

async function listUsers({
  page = 1,
  limit = 20,
  role,
  departmentId,
  isActive,
}) {
  const validationErrors = validateListUsersFilters({
    role,
    departmentId,
    isActive,
  });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;

  const normalizedFilters = {
    role: role || null,
    departmentId: departmentId || null,
    isActive:
      isActive === undefined || isActive === null || isActive === ""
        ? null
        : isActive === "true",
  };

  const [items, total] = await Promise.all([
    usersRepository.findAll({
      limit: safeLimit,
      offset,
      filters: normalizedFilters,
    }),
    usersRepository.countAll({
      filters: normalizedFilters,
    }),
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

async function getUserById(id) {
  const validationErrors = validateUserId(id);

  if (validationErrors.length > 0) {
    throw new AppError("Invalid user ID", 400, validationErrors);
  }

  const user = await usersRepository.findById(id);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return user;
}

async function createUser({
  name,
  email,
  passwordHash,
  role,
  departmentId = null,
}) {
  const validationErrors = validateCreateUser({
    name,
    email,
    passwordHash,
    role,
    departmentId,
  });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();

  const existingUser = await usersRepository.findByEmail(normalizedEmail);

  if (existingUser) {
    throw new AppError("User with this email already exists", 409);
  }

  if (departmentId) {
    const department = await departmentsRepository.findById(departmentId);

    if (!department) {
      throw new AppError("Department not found", 404);
    }
  }

  try {
    return await usersRepository.create({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash: passwordHash.trim(),
      role,
      departmentId: departmentId || null,
    });
  } catch (error) {
    if (error.code === "23505") {
      throw new AppError("User with this email already exists", 409);
    }

    if (error.code === "23503") {
      throw new AppError("Department not found", 404);
    }

    throw error;
  }
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
};
