function validateCreateDepartment(payload) {
  const errors = [];

  validateName(payload.name, errors);
  validateDescription(payload.description, errors);

  return errors;
}

function validateListDepartmentsFilters(filters) {
  const errors = [];

  validateIsActive(filters.isActive, errors);

  return errors;
}

function validateDepartmentId(id) {
  const errors = [];
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(id)) {
    errors.push({
      field: "id",
      message: "Id must be a valid UUID",
    });
  }

  return errors;
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

  if (name.length > 100) {
    errors.push({
      field: "name",
      message: "Name must be at most 100 characters",
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

  if (description.length > 500) {
    errors.push({
      field: "description",
      message: "Description must be at most 500 characters",
    });
  }
}

function validateIsActive(isActive, errors) {
  if (isActive === undefined || isActive === null || isActive === "") {
    return;
  }

  if (!["true", "false"].includes(isActive)) {
    errors.push({
      field: "isActive",
      message: "isActive must be either true or false",
    });
  }
}

module.exports = {
  validateCreateDepartment,
  validateListDepartmentsFilters,
  validateDepartmentId,
};
