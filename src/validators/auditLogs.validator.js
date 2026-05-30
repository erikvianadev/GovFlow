function validateCreateAuditLog(payload) {
  const errors = [];

  validateAction(payload.action, errors);
  validateEntity(payload.entity, errors);
  validateEntityId(payload.entityId, errors);
  validateActorId(payload.actorId, errors);
  validateMetadata(payload.metadata, errors);

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

module.exports = {
  validateCreateAuditLog,
};
