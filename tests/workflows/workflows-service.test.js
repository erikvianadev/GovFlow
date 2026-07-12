const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(
  __dirname,
  "../../src/modules/workflows/workflows.service.js"
);
const workflowsRepositoryPath = path.join(
  __dirname,
  "../../src/modules/workflows/workflows.repository.js"
);
const safeAuditLogPath = path.join(__dirname, "../../src/utils/safeAuditLog.js");

const validWorkflowId = "11111111-1111-4111-8111-111111111111";
const validUserId = "22222222-2222-4222-8222-222222222222";
const departmentA = "33333333-3333-4333-8333-333333333333";
const departmentB = "44444444-4444-4444-8444-444444444444";

function mockModule(modulePath, exports) {
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function loadService({
  workflow = {
    id: validWorkflowId,
    department_id: departmentA,
    is_active: true,
  },
  updateImpl,
} = {}) {
  const calls = {
    findByIdArg: null,
    updatePayload: null,
    auditPayload: null,
  };

  [servicePath, workflowsRepositoryPath, safeAuditLogPath].forEach(
    (modulePath) => delete require.cache[modulePath]
  );

  mockModule(workflowsRepositoryPath, {
    findById: async (id) => {
      calls.findByIdArg = id;
      return workflow;
    },
    update: async (payload) => {
      calls.updatePayload = payload;

      if (updateImpl) {
        return updateImpl(payload);
      }

      return {
        ...workflow,
        is_active: payload.isActive,
      };
    },
  });
  mockModule(safeAuditLogPath, {
    safeRegisterAuditLog: async (payload) => {
      calls.auditPayload = payload;
    },
  });

  return {
    service: require(servicePath),
    calls,
  };
}

test("updateWorkflow updates is_active and registers an audit log for an authorized ADMIN", async () => {
  const { service, calls } = loadService();

  const result = await service.updateWorkflow(
    validWorkflowId,
    { isActive: false },
    { id: validUserId, role: "ADMIN" }
  );

  assert.strictEqual(calls.findByIdArg, validWorkflowId);
  assert.deepStrictEqual(calls.updatePayload, {
    id: validWorkflowId,
    isActive: false,
  });
  assert.strictEqual(result.is_active, false);
  assert.deepStrictEqual(calls.auditPayload, {
    action: "WORKFLOW_UPDATED",
    entity: "workflow",
    entityId: validWorkflowId,
    actorId: validUserId,
    metadata: {
      isActive: false,
    },
  });
});

test("updateWorkflow allows a MANAGER to update a workflow within their own department", async () => {
  const { service, calls } = loadService({
    workflow: {
      id: validWorkflowId,
      department_id: departmentA,
      is_active: true,
    },
  });

  const result = await service.updateWorkflow(
    validWorkflowId,
    { isActive: false },
    { id: validUserId, role: "MANAGER", department_id: departmentA }
  );

  assert.strictEqual(result.is_active, false);
  assert.notStrictEqual(calls.updatePayload, null);
});

test("updateWorkflow throws 404 'Workflow not found' when the workflow does not exist", async () => {
  const { service, calls } = loadService({ workflow: null });

  await assert.rejects(
    service.updateWorkflow(
      validWorkflowId,
      { isActive: false },
      { id: validUserId, role: "ADMIN" }
    ),
    (error) => error.statusCode === 404 && error.message === "Workflow not found"
  );

  assert.strictEqual(calls.updatePayload, null);
  assert.strictEqual(calls.auditPayload, null);
});

test("updateWorkflow throws 404 (not 403) when a MANAGER targets another department's workflow", async () => {
  const { service, calls } = loadService({
    workflow: {
      id: validWorkflowId,
      department_id: departmentA,
      is_active: true,
    },
  });

  await assert.rejects(
    service.updateWorkflow(
      validWorkflowId,
      { isActive: false },
      { id: validUserId, role: "MANAGER", department_id: departmentB }
    ),
    (error) => error.statusCode === 404 && error.message === "Workflow not found"
  );

  assert.strictEqual(calls.updatePayload, null);
  assert.strictEqual(calls.auditPayload, null);
});

test("updateWorkflow throws 400 when is_active is missing", async () => {
  const { service, calls } = loadService();

  await assert.rejects(
    service.updateWorkflow(validWorkflowId, {}, { id: validUserId, role: "ADMIN" }),
    (error) =>
      error.statusCode === 400 &&
      error.errors.some(
        (item) => item.field === "is_active" && item.message === "is_active is required"
      )
  );

  assert.strictEqual(calls.findByIdArg, null);
  assert.strictEqual(calls.updatePayload, null);
});

test("updateWorkflow throws 400 when is_active has the wrong type", async () => {
  const { service, calls } = loadService();

  await assert.rejects(
    service.updateWorkflow(
      validWorkflowId,
      { isActive: "true" },
      { id: validUserId, role: "ADMIN" }
    ),
    (error) =>
      error.statusCode === 400 &&
      error.errors.some(
        (item) =>
          item.field === "is_active" && item.message === "is_active must be a boolean"
      )
  );

  assert.strictEqual(calls.findByIdArg, null);
  assert.strictEqual(calls.updatePayload, null);
});

test("updateWorkflow throws 400 for a malformed workflow id", async () => {
  const { service, calls } = loadService();

  await assert.rejects(
    service.updateWorkflow(
      "not-a-uuid",
      { isActive: false },
      { id: validUserId, role: "ADMIN" }
    ),
    (error) => error.statusCode === 400 && error.message === "Invalid workflow ID"
  );

  assert.strictEqual(calls.findByIdArg, null);
  assert.strictEqual(calls.updatePayload, null);
});

// --- duplicateWorkflow -----------------------------------------------------

function loadServiceForDuplicate({
  workflow = {
    id: validWorkflowId,
    name: "Original workflow",
    description: "Original description",
    department_id: departmentA,
    is_active: true,
  },
  duplicateImpl,
} = {}) {
  const calls = {
    findByIdArg: null,
    duplicatePayload: null,
    auditPayload: null,
  };

  [servicePath, workflowsRepositoryPath, safeAuditLogPath].forEach(
    (modulePath) => delete require.cache[modulePath]
  );

  mockModule(workflowsRepositoryPath, {
    findById: async (id) => {
      calls.findByIdArg = id;
      return workflow;
    },
    duplicate: async (payload) => {
      calls.duplicatePayload = payload;

      if (duplicateImpl) {
        return duplicateImpl(payload);
      }

      return {
        id: "new-workflow-1",
        name: payload.name,
        description: payload.description,
        department_id: payload.departmentId,
        created_by: payload.createdBy,
        is_active: false,
      };
    },
  });
  mockModule(safeAuditLogPath, {
    safeRegisterAuditLog: async (payload) => {
      calls.auditPayload = payload;
    },
  });

  return {
    service: require(servicePath),
    calls,
  };
}

test("duplicateWorkflow copies the source workflow's department, defaults the name to '<original> (copy)', is inactive, and registers an audit log", async () => {
  const { service, calls } = loadServiceForDuplicate();

  const result = await service.duplicateWorkflow(
    validWorkflowId,
    {},
    { id: validUserId, role: "ADMIN" }
  );

  assert.strictEqual(calls.findByIdArg, validWorkflowId);
  assert.deepStrictEqual(calls.duplicatePayload, {
    sourceWorkflowId: validWorkflowId,
    name: "Original workflow (copy)",
    description: "Original description",
    departmentId: departmentA,
    createdBy: validUserId,
  });
  assert.strictEqual(result.is_active, false);
  assert.strictEqual(result.department_id, departmentA);
  assert.deepStrictEqual(calls.auditPayload, {
    action: "WORKFLOW_DUPLICATED",
    entity: "workflow",
    entityId: "new-workflow-1",
    actorId: validUserId,
    metadata: {
      sourceWorkflowId: validWorkflowId,
      newWorkflowId: "new-workflow-1",
    },
  });
});

test("duplicateWorkflow uses body.name when provided, instead of the default '(copy)' name", async () => {
  const { service, calls } = loadServiceForDuplicate();

  await service.duplicateWorkflow(
    validWorkflowId,
    { name: "Custom name" },
    { id: validUserId, role: "ADMIN" }
  );

  assert.strictEqual(calls.duplicatePayload.name, "Custom name");
});

test("duplicateWorkflow throws 400 (not a raw DB error) when the default '<name> (copy)' exceeds 150 characters", async () => {
  const longName = "A".repeat(150);
  const { service, calls } = loadServiceForDuplicate({
    workflow: {
      id: validWorkflowId,
      name: longName,
      description: "Original description",
      department_id: departmentA,
      is_active: true,
    },
  });

  await assert.rejects(
    service.duplicateWorkflow(
      validWorkflowId,
      {},
      { id: validUserId, role: "ADMIN" }
    ),
    (error) =>
      error.statusCode === 400 &&
      error.message === "Validation failed" &&
      error.errors.some(
        (item) =>
          item.field === "name" &&
          item.message === "Name must be at most 150 characters"
      )
  );

  assert.strictEqual(calls.duplicatePayload, null);
  assert.strictEqual(calls.auditPayload, null);
});

test("duplicateWorkflow allows a MANAGER to duplicate a workflow within their own department", async () => {
  const { service, calls } = loadServiceForDuplicate({
    workflow: {
      id: validWorkflowId,
      name: "Original workflow",
      description: null,
      department_id: departmentA,
      is_active: true,
    },
  });

  const result = await service.duplicateWorkflow(
    validWorkflowId,
    {},
    { id: validUserId, role: "MANAGER", department_id: departmentA }
  );

  assert.strictEqual(result.is_active, false);
  assert.notStrictEqual(calls.duplicatePayload, null);
});

test("duplicateWorkflow throws 404 'Workflow not found' when the source workflow does not exist", async () => {
  const { service, calls } = loadServiceForDuplicate({ workflow: null });

  await assert.rejects(
    service.duplicateWorkflow(
      validWorkflowId,
      {},
      { id: validUserId, role: "ADMIN" }
    ),
    (error) => error.statusCode === 404 && error.message === "Workflow not found"
  );

  assert.strictEqual(calls.duplicatePayload, null);
  assert.strictEqual(calls.auditPayload, null);
});

test("duplicateWorkflow throws 404 (not 403) when a MANAGER targets another department's workflow, and never starts the duplication", async () => {
  const { service, calls } = loadServiceForDuplicate({
    workflow: {
      id: validWorkflowId,
      name: "Original workflow",
      description: null,
      department_id: departmentA,
      is_active: true,
    },
  });

  await assert.rejects(
    service.duplicateWorkflow(
      validWorkflowId,
      {},
      { id: validUserId, role: "MANAGER", department_id: departmentB }
    ),
    (error) => error.statusCode === 404 && error.message === "Workflow not found"
  );

  assert.strictEqual(calls.duplicatePayload, null);
  assert.strictEqual(calls.auditPayload, null);
});

test("duplicateWorkflow throws 400 for a malformed workflow id", async () => {
  const { service, calls } = loadServiceForDuplicate();

  await assert.rejects(
    service.duplicateWorkflow(
      "not-a-uuid",
      {},
      { id: validUserId, role: "ADMIN" }
    ),
    (error) => error.statusCode === 400 && error.message === "Invalid workflow ID"
  );

  assert.strictEqual(calls.findByIdArg, null);
  assert.strictEqual(calls.duplicatePayload, null);
});
