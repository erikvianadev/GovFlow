function validateCreateWorkflow(payload) {
  const errors = [];

  validateName(payload.name, errors);
  validateDescription(payload.description, errors);
  validateOptionalUuid(payload.departmentId, "departmentId", "Department ID", errors);

  return errors;
}

function validateListWorkflowsFilters(filters) {
  const errors = [];

  validateOptionalUuid(filters.departmentId, "departmentId", "Department ID", errors);
  validateOptionalUuid(filters.createdBy, "createdBy", "Created by", errors);
  validateOptionalBooleanString(filters.isActive, "isActive", errors);

  return errors;
}

function validateUpdateWorkflow(payload) {
  const errors = [];

  validateIsActive(payload.isActive, errors);

  return errors;
}

function validateWorkflowId(id) {
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

function validateDescription(description, errors) {
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

function validateIsActive(isActive, errors) {
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
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidRegex.test(value);
}

module.exports = {
  validateCreateWorkflow,
  validateUpdateWorkflow,
  validateListWorkflowsFilters,
  validateWorkflowId,
};
