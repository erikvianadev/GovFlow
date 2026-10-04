type ValidationError = {
  field: string;
  message: string;
};

type CreateWorkflowPayload = {
  name?: unknown;
  description?: unknown;
  departmentId?: unknown;
};

type UpdateWorkflowPayload = {
  isActive?: unknown;
};

type ListWorkflowsFilters = {
  departmentId?: unknown;
  createdBy?: unknown;
  isActive?: unknown;
};

const VALID_BOOLEAN_STRINGS = ["true", "false"] as const;

type BooleanString = typeof VALID_BOOLEAN_STRINGS[number];

function validateCreateWorkflow(
  payload: CreateWorkflowPayload 
): ValidationError[] {
  const errors: ValidationError[] = [];

  validateName(payload.name, errors);
  validateDescription(payload.description, errors);
  validateOptionalUuid(
    payload.departmentId, 
    "departmentId", 
    "Department ID", 
    errors
  );

  return errors;
}

function validateListWorkflowsFilters(
    filters: ListWorkflowsFilters
): ValidationError[] {
  const errors: ValidationError[] = [];

  validateOptionalUuid(
    filters.departmentId, 
    "departmentId", 
    "Department ID", 
    errors
  );

  validateOptionalUuid(filters.createdBy, "createdBy", "Created by", errors);
  validateOptionalBooleanString(filters.isActive, "isActive", errors);

  return errors;
}

function validateUpdateWorkflow(
    payload: UpdateWorkflowPayload
): ValidationError[] {
  const errors: ValidationError[] = [];

  validateIsActive(payload.isActive, errors);

  return errors;
}

function validateWorkflowId(id: unknown): ValidationError[] {
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

function validateDescription(
    description: unknown,  
    errors: ValidationError[]
): void {
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

  if (description.length > 1000) {
    errors.push({
      field: "description",
      message: "Description must be at most 1000 characters",
    });
  }
}

function validateIsActive(
    isActive: unknown, 
    errors: ValidationError[]
): void {
  if (isActive === undefined || isActive === null) {
    errors.push({
      field: "is_active",
      message: "is_active is required",
    });
    return;
  }

  if (typeof isActive !== "boolean") {
    errors.push({
      field: "is_active",
      message: "is_active must be a boolean",
    });
  }
}

function isValidBooleanString(value: unknown): value is BooleanString {
  return typeof value === 'string' && (
    VALID_BOOLEAN_STRINGS as readonly string[]
  ).includes(value)
}

function validateOptionalBooleanString(
    value: unknown, 
    field: string, 
    errors: ValidationError[]
): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (!isValidBooleanString(value)) {
    errors.push({
      field,
      message: `${field} must be either true or false`,
    });
  }
}

function validateOptionalUuid(
    value: unknown, 
    field: string, 
    label: string, 
    errors: ValidationError[]
): void {
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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return (typeof value === 'string' && uuidRegex.test(value));
}

export = {
  validateCreateWorkflow,
  validateUpdateWorkflow,
  validateListWorkflowsFilters,
  validateWorkflowId,
  validateName,
};
