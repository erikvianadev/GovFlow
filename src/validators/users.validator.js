const VALID_ROLES = ["ADMIN", "MANAGER", "OPERATOR"];

function validateCreateUser(payload) {
  const errors = [];

  validateName(payload.name, errors);
  validateEmail(payload.email, errors);
  validatePassword(payload.password, errors);
  validateRole(payload.role, errors);
  validateOptionalUuid(payload.departmentId, "departmentId", "Department ID", errors);

  return errors;
}

function validateListUsersFilters(filters) {
  const errors = [];

  validateOptionalRole(filters.role, errors);
  validateOptionalUuid(filters.departmentId, "departmentId", "Department ID", errors);
  validateOptionalBooleanString(filters.isActive, "isActive", errors);

  return errors;
}

function validateUserId(id) {
  if (isValidUuid(id)) {
    return [];
  }

  return [
    {
      field: "id",
      message: "Id must be a valid UUID",
    },
  ];
}

function validateName(name, errors) {
  if (name === undefined || name === null) {
    errors.push({
      field: "name",
      message: "Name is required",
    });
    return;
  }

  if (typeof name !== "string") {
    errors.push({
      field: "name",
      message: "Name must be a string",
    });
    return;
  }

  if (name.trim().length === 0) {
    errors.push({
      field: "name",
      message: "Name cannot be empty",
    });
    return;
  }

  if (name.length > 150) {
    errors.push({
      field: "name",
      message: "Name must be at most 150 characters",
    });
  }
}

function validateEmail(email, errors) {
  if (email === undefined || email === null) {
    errors.push({
      field: "email",
      message: "Email is required",
    });
    return;
  }

  if (typeof email !== "string") {
    errors.push({
      field: "email",
      message: "Email must be a string",
    });
    return;
  }

  const normalizedEmail = email.trim();

  if (normalizedEmail.length === 0) {
    errors.push({
      field: "email",
      message: "Email cannot be empty",
    });
    return;
  }

  if (normalizedEmail.length > 255) {
    errors.push({
      field: "email",
      message: "Email must be at most 255 characters",
    });
    return;
  }

  const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!basicEmailRegex.test(normalizedEmail)) {
    errors.push({
      field: "email",
      message: "Email must be valid",
    });
  }
}

function validatePassword(password, errors) {
  if (password === undefined || password === null) {
    errors.push({
      field: "password",
      message: "Password is required",
    });
    return;
  }

  if (typeof password !== "string") {
    errors.push({
      field: "password",
      message: "Password must be a string",
    });
    return;
  }

  if (password.length < 8) {
    errors.push({
      field: "password",
      message: "Password must be at least 8 characters",
    });
    return;
  }

  if (password.length > 72) {
    errors.push({
      field: "password",
      message: "Password must be at most 72 characters",
    });
    return;
  }

  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);

  if (!hasLetter || !hasNumber) {
    errors.push({
      field: "password",
      message: "Password must contain at least one letter and one number",
    });
  }
}

function validateRole(role, errors) {
  if (role === undefined || role === null) {
    errors.push({
      field: "role",
      message: "Role is required",
    });
    return;
  }

  if (typeof role !== "string") {
    errors.push({
      field: "role",
      message: "Role must be a string",
    });
    return;
  }

  if (!VALID_ROLES.includes(role)) {
    errors.push({
      field: "role",
      message: "Role must be one of: ADMIN, MANAGER, OPERATOR",
    });
  }
}

function validateOptionalRole(role, errors) {
  if (role === undefined || role === null || role === "") {
    return;
  }

  validateRole(role, errors);
}

function validateOptionalBooleanString(value, field, errors) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (!["true", "false"].includes(value)) {
    errors.push({
      field,
      message: `${field} must be either true or false`,
    });
  }
}

function validateOptionalUuid(value, field, label, errors) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (typeof value !== "string") {
    errors.push({
      field,
      message: `${label} must be a string`,
    });
    return;
  }

  if (!isValidUuid(value)) {
    errors.push({
      field,
      message: `${label} must be a valid UUID`,
    });
  }
}

function isValidUuid(value) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return uuidRegex.test(value);
}

module.exports = {
  validateCreateUser,
  validateListUsersFilters,
  validateUserId,
  VALID_ROLES,
};
