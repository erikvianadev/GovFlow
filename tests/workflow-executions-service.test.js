const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutions.service.js"
);
const databasePath = path.join(__dirname, "../src/config/database.js");
const workflowsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflows/workflows.repository.js"
);
const workflowStepsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflow-steps/workflowSteps.repository.js"
);
const workflowExecutionStepsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflow-execution-steps/workflowExecutionSteps.repository.js"
);
const workflowExecutionsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutions.repository.js"
);
const safeAuditLogPath = path.join(__dirname, "../src/utils/safeAuditLog.js");

const validWorkflowId = "11111111-1111-4111-8111-111111111111";
const validUserId = "22222222-2222-4222-8222-222222222222";

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
    is_active: true,
  },
  workflowSteps = [
    { id: "step-1" },
    { id: "step-2" },
  ],
  createManyImpl,
} = {}) {
  const trx = {
    query: async () => ({ rows: [] }),
  };
  const calls = {
    createdExecution: null,
    activeWorkflowId: null,
    createManyPayload: null,
    auditPayload: null,
    rolledBack: false,
  };
  const execution = {
    id: "execution-1",
    workflow_id: validWorkflowId,
    started_by: validUserId,
    status: "PENDING",
    input: null,
  };

  [
    servicePath,
    databasePath,
    workflowsRepositoryPath,
    workflowStepsRepositoryPath,
    workflowExecutionStepsRepositoryPath,
    workflowExecutionsRepositoryPath,
    safeAuditLogPath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(databasePath, {
    transaction: async (callback) => {
      try {
        return await callback(trx);
      } catch (error) {
        calls.rolledBack = true;
        throw error;
      }
    },
  });
  mockModule(workflowsRepositoryPath, {
    findById: async () => workflow,
  });
  mockModule(workflowStepsRepositoryPath, {
    findActiveByWorkflowId: async (workflowId, db) => {
      assert.strictEqual(db, trx);
      calls.activeWorkflowId = workflowId;
      return workflowSteps;
    },
  });
  mockModule(workflowExecutionsRepositoryPath, {
    create: async (payload, db) => {
      assert.strictEqual(db, trx);
      calls.createdExecution = payload;
      return execution;
    },
  });
  mockModule(workflowExecutionStepsRepositoryPath, {
    createMany: async (payload, db) => {
      assert.strictEqual(db, trx);
      calls.createManyPayload = payload;

      if (createManyImpl) {
        return createManyImpl(payload);
      }

      return payload.map((item, index) => ({
        id: `execution-step-${index + 1}`,
        execution_id: item.executionId,
        step_id: item.stepId,
        status: "PENDING",
      }));
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

test("createWorkflowExecution creates pending execution steps for active workflow steps", async () => {
  const { service, calls } = loadService();

  const result = await service.createWorkflowExecution({
    workflowId: validWorkflowId,
    input: { requestId: "REQ-001" },
    startedBy: validUserId,
  });

  assert.deepStrictEqual(calls.createdExecution, {
    workflowId: validWorkflowId,
    startedBy: validUserId,
    input: { requestId: "REQ-001" },
  });
  assert.strictEqual(calls.activeWorkflowId, validWorkflowId);
  assert.deepStrictEqual(calls.createManyPayload, [
    { executionId: "execution-1", stepId: "step-1" },
    { executionId: "execution-1", stepId: "step-2" },
  ]);
  assert.strictEqual(result.execution_steps_count, 2);
  assert.deepStrictEqual(calls.auditPayload.metadata, {
    workflowId: validWorkflowId,
    status: "PENDING",
    executionStepsCount: 2,
  });
});

test("createWorkflowExecution blocks workflows without active steps and rolls back", async () => {
  const { service, calls } = loadService({
    workflowSteps: [],
  });

  await assert.rejects(
    service.createWorkflowExecution({
      workflowId: validWorkflowId,
      startedBy: validUserId,
    }),
    (error) =>
      error.statusCode === 409 &&
      error.message === "Workflow must have at least one active step to be executed"
  );

  assert.strictEqual(calls.rolledBack, true);
  assert.strictEqual(calls.createManyPayload, null);
  assert.strictEqual(calls.auditPayload, null);
});

test("createWorkflowExecution rolls back when execution step creation fails", async () => {
  const { service, calls } = loadService({
    createManyImpl: async () => {
      throw new Error("createMany failed");
    },
  });

  await assert.rejects(
    service.createWorkflowExecution({
      workflowId: validWorkflowId,
      startedBy: validUserId,
    }),
    /createMany failed/
  );

  assert.strictEqual(calls.rolledBack, true);
  assert.strictEqual(calls.auditPayload, null);
});
