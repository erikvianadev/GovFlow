const AppError = require("../../errors/AppError");
const departmentsRepository = require("./departments.repository");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");
const {
  validateCreateDepartment,
  validateListDepartmentsFilters,
  validateDepartmentId,
} = require("../../validators/departments.validator");

async function listDepartments({ page = 1, limit = 20, isActive }) {
  const validationErrors = validateListDepartmentsFilters({ isActive });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;

  const normalizedFilters = {
    isActive:
      isActive === undefined || isActive === null || isActive === ""
        ? null
        : isActive === "true",
  };

  const [items, total] = await Promise.all([
    departmentsRepository.findAll({
      limit: safeLimit,
      offset,
      filters: normalizedFilters,
    }),
    departmentsRepository.countAll({
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

async function getDepartmentById(id) {
  const validationErrors = validateDepartmentId(id);

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const department = await departmentsRepository.findById(id);

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  return department;
}

async function createDepartment({ name, description = null }) {
  const validationErrors = validateCreateDepartment({
    name,
    description,
  });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const normalizedName = name.trim();
  const normalizedDescription =
    description === undefined || description === null ? null : description.trim();

  const existingDepartment = await departmentsRepository.findByName(normalizedName);

  if (existingDepartment) {
    throw new AppError("Department with this name already exists", 409);
  }

  try {
    const createdDepartment = await departmentsRepository.create({
      name: normalizedName,
      description: normalizedDescription,
    });

    await safeRegisterAuditLog({
      action: "DEPARTMENT_CREATED",
      entity: "department",
      entityId: createdDepartment.id,
      actorId: null,
      metadata: {
        name: createdDepartment.name,
      },
    });

    return createdDepartment;
  } catch (error) {
    if (error.code === "23505") {
      throw new AppError("Department with this name already exists", 409);
    }

    throw error;
  }
}

module.exports = {
  listDepartments,
  getDepartmentById,
  createDepartment,
};
