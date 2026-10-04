type ValidationError = {
  field: string,
  message: string,
}

type PayloadDepartment = {
  name?: unknown,
  description?: unknown
}

type DepartmentFilters = {
  isActive?: unknown
}

const VALID_ACTIVE_FILTERS = ['true', 'false'] as const;

type ActiveFilter = typeof VALID_ACTIVE_FILTERS[number];

function validateCreateDepartment(payload: PayloadDepartment): ValidationError[] {
  const errors: ValidationError[] = [];

  validateName(payload.name, errors);
  validateDescription(payload.description, errors);

  return errors;
}

function validateListDepartmentsFilters(filters: DepartmentFilters): ValidationError[] {
  const errors: ValidationError[] = [];

  validateIsActive(filters.isActive, errors);

  return errors;
}

function isActiveFilter(value: unknown): value is ActiveFilter {
  return typeof value === 'string' && 
  (VALID_ACTIVE_FILTERS as readonly string[]).includes(value)
}

function validateDepartmentId(id: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (typeof id !== "string" || !uuidPattern.test(id)) {
    errors.push({
      field: "id",
      message: "Id must be a valid UUID",
    });
  }
  return errors;
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

  if (name.length > 100) {
    errors.push({
      field: "name",
      message: "Name must be at most 100 characters",
    });
  }
}

function validateDescription(description: unknown, errors: ValidationError[]): void {
  if (description === undefined || description === null) {
    return;
  }

  if (typeof description !== "string") {
    errors.push({
      field: "description",
      message: "Description must be a string",
    });
    return;
  }

  if (description.length > 500) {
    errors.push({
      field: "description",
      message: "Description must be at most 500 characters",
    });
  }
}

function validateIsActive(isActive: unknown, errors: ValidationError[]): void {
  if (isActive === undefined || isActive === null || isActive === '') {
    return;
  }

  if (!isActiveFilter(isActive)) {
    errors.push({
      field: "isActive",
      message: "isActive must be either true or false"
    })
  }
}

export = {
  validateCreateDepartment,
  validateListDepartmentsFilters,
  validateDepartmentId,
};
