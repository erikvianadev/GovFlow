type ValidationError = {
  field: string;
  message: string;
};

type CreateUserPayload = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  departmentId?: unknown;
};

type ListUsersFilters = {
  role?: unknown;
  departmentId?: unknown;
  isActive?: unknown;
};

const VALID_ROLES = ["ADMIN", "MANAGER", "OPERATOR"] as const;

type UserRole = (typeof VALID_ROLES)[number];

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" &&
    (VALID_ROLES as readonly string[]).includes(value);
}

function validateCreateUser(payload: CreateUserPayload): ValidationError[] {
  const errors: ValidationError[] = [];

  validateName(payload.name, errors);
  validateEmail(payload.email, errors);
  validatePassword(payload.password, errors);
  validateRole(payload.role, errors);
  validateOptionalUuid(payload.departmentId, "departmentId", "Department ID", errors);

  return errors;
}

function validateListUsersFilters(filters: ListUsersFilters): ValidationError[] {
  const errors: ValidationError[] = [];

  validateOptionalRole(filters.role, errors);
  validateOptionalUuid(filters.departmentId, "departmentId", "Department ID", errors);
  validateOptionalBooleanString(filters.isActive, "isActive", errors);

  return errors;
}

function validateUserId(id: unknown): ValidationError[] {
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

function validateName(name: unknown, errors: ValidationError[]): void {
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

function validateEmail(email: unknown, errors: ValidationError[]): void {
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

// Maximum password length in bytes. bcrypt silently truncates input beyond 72
// bytes, so we reject longer passwords (measured in bytes, not characters, so
// multibyte input cannot slip past the effective bcrypt limit).
const MAX_PASSWORD_BYTES = 72;

function validatePassword(password: unknown, errors: ValidationError[]): void {
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

  if (password.length < 12) {
    errors.push({
      field: "password",
      message: "Password must be at least 12 characters",
    });
    return;
  }

  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    errors.push({
      field: "password",
      message: `Password must be at most ${MAX_PASSWORD_BYTES} bytes`,
    });
    return;
  }

  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
    errors.push({
      field: "password",
      message:
        "Password must contain at least one uppercase letter, one lowercase letter, one number and one special character",
    });
  }
}

function validateRole(role: unknown, errors: ValidationError[]): void {
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

  if (!isUserRole(role)) {
    errors.push({
      field: "role",
      message: "Role must be one of: ADMIN, MANAGER, OPERATOR",
    });
  }
}

function validateOptionalRole(role: unknown, errors: ValidationError[]): void {
  if (role === undefined || role === null || role === "") {
    return;
  }

  validateRole(role, errors);
}

function validateOptionalBooleanString(value: unknown, field: string, errors: ValidationError[]): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (!(typeof value === "string" && ["true", "false"].includes(value))) {
    errors.push({
      field,
      message: `${field} must be either true or false`,
    });
  }
}

function validateOptionalUuid(value: unknown, field: string, label: string, errors: ValidationError[]): void {
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

function isValidUuid(value: unknown): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // The assertion is erased at runtime, preserving RegExp.test's original
  // coercion of non-string inputs (including its exceptions).
  return uuidRegex.test(value as string);
}

export = {
  validateCreateUser,
  validateListUsersFilters,
  validateUserId,
  VALID_ROLES,
};
