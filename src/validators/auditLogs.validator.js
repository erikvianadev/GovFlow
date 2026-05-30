function validateCreateAuditLog(payload) {
  const errors = [];

  validateAction(payload.action, errors);
  validateEntity(payload.entity, errors);
  validateEntityId(payload.entityId, errors);
  validateActorId(payload.actorId, errors);
  validateMetadata(payload.metadata, errors);

  return errors;
}

function validateListAuditLogsFilters(filters) {
  const errors = [];

  validateOptionalString(filters.action, "action", "Action", errors, 100);
  validateOptionalString(filters.entity, "entity", "Entity", errors, 100);
  validateOptionalDate(filters.startDate, "startDate", "Start date", errors);
  validateOptionalDate(filters.endDate, "endDate", "End date", errors);
  validateDateRange(filters.startDate, filters.endDate, errors);

  return errors;
}

function validateAction(action, errors) {
  if (action === undefined || action === null) {
    errors.push({
      field: "action",
      message: "Action is required",
    });
    return;
  }

  if (typeof action !== "string") {
    errors.push({
      field: "action",
      message: "Action must be a string",
    });
    return;
  }

  if (action.trim().length === 0) {
    errors.push({
      field: "action",
      message: "Action cannot be empty",
    });
    return;
  }

  if (action.length > 100) {
    errors.push({
      field: "action",
      message: "Action must be at most 100 characters",
    });
  }
}

function validateEntity(entity, errors) {
  if (entity === undefined || entity === null) {
    errors.push({
      field: "entity",
      message: "Entity is required",
    });
    return;
  }

  if (typeof entity !== "string") {
    errors.push({
      field: "entity",
      message: "Entity must be a string",
    });
    return;
  }

  if (entity.trim().length === 0) {
    errors.push({
      field: "entity",
      message: "Entity cannot be empty",
    });
    return;
  }

  if (entity.length > 100) {
    errors.push({
      field: "entity",
      message: "Entity must be at most 100 characters",
    });
  }
}

function validateEntityId(entityId, errors) {
  if (entityId === undefined || entityId === null) {
    return;
  }

  if (typeof entityId !== "string") {
    errors.push({
      field: "entityId",
      message: "Entity ID must be a string",
    });
    return;
  }

  if (entityId.length > 100) {
    errors.push({
      field: "entityId",
      message: "Entity ID must be at most 100 characters",
    });
  }
}

function validateActorId(actorId, errors) {
  if (actorId === undefined || actorId === null) {
    return;
  }

  if (typeof actorId !== "string") {
    errors.push({
      field: "actorId",
      message: "Actor ID must be a string",
    });
  }
}

function validateMetadata(metadata, errors) {
  if (metadata === undefined || metadata === null) {
    return;
  }

  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    errors.push({
      field: "metadata",
      message: "Metadata must be an object",
    });
  }
}

function validateOptionalString(value, field, label, errors, maxLength) {
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

  if (value.trim().length === 0) {
    errors.push({
      field,
      message: `${label} cannot be empty`,
    });
    return;
  }

  if (value.length > maxLength) {
    errors.push({
      field,
      message: `${label} must be at most ${maxLength} characters`,
    });
  }
}

function validateOptionalDate(value, field, label, errors) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    errors.push({
      field,
      message: `${label} must be a valid date`,
    });
  }
}

function validateDateRange(startDate, endDate, errors) {
  if (!startDate || !endDate) {
    return;
  }

  const parsedStartDate = new Date(startDate);
  const parsedEndDate = new Date(endDate);

  if (
    Number.isNaN(parsedStartDate.getTime()) ||
    Number.isNaN(parsedEndDate.getTime())
  ) {
    return;
  }

  if (parsedStartDate > parsedEndDate) {
    errors.push({
      field: "dateRange",
      message: "Start date must be before or equal to end date",
    });
  }
}

module.exports = {
  validateCreateAuditLog,
  validateListAuditLogsFilters,
};
