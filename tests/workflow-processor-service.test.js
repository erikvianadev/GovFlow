const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessor.service.js"
);
const workflowExecutionsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutions.repository.js"
);
const workflowExecutionStepsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflow-execution-steps/workflowExecutionSteps.repository.js"
);
const safeAuditLogPath = path.join(__dirname, "../src/utils/safeAuditLog.js");
const workflowStepHandlersPath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowStepHandlers.js"
);

const validExecutionId = "11111111-1111-4111-8111-111111111111";
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
  execution = {
    id: validExecutionId,
    workflow_id: "workflow-1",
    status: "PENDING",
  },
  steps = [
    {
      id: "execution-step-1",
      step_id: "step-1",
      step_order: 1,
      action_type: "MANUAL",
    },
    {
      id: "execution-step-2",
      step_id: "step-2",
      step_order: 2,
      action_type: "NOTIFICATION",
    },
  ],
  handlerImpl,
  claimable = true,
} = {}) {
  const trx = {
    query: async () => ({ rows: [] }),
  };
  const calls = {
    audit: [],
    claims: [],
    executionUpdates: [],
    stepUpdates: [],
  };

  [
    servicePath,
    workflowExecutionsRepositoryPath,
    workflowExecutionStepsRepositoryPath,
    safeAuditLogPath,
    workflowStepHandlersPath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(workflowExecutionsRepositoryPath, {
    findById: async () => execution,
    claimPendingExecution: async (payload, db) => {
      assert.strictEqual(db, undefined);
      calls.claims.push(payload);

      if (!claimable) {
        return undefined;
      }

      return {
        id: payload.id,
        workflow_id: execution ? execution.workflow_id : "workflow-1",
        status: "RUNNING",
      };
    },
    updateStatus: async (payload, db) => {
      assert.strictEqual(db, undefined);
      calls.executionUpdates.push(payload);

      return {
        id: payload.id,
        workflow_id: "workflow-1",
        status: payload.status,
        result: payload.result || null,
      };
    },
  });
  mockModule(workflowExecutionStepsRepositoryPath, {
    findByExecutionId: async () => steps,
    updateStatus: async (payload, db) => {
      assert.strictEqual(db, undefined);
      calls.stepUpdates.push(payload);
      return payload;
    },
  });
  mockModule(safeAuditLogPath, {
    safeRegisterAuditLog: async (payload) => {
      calls.audit.push(payload);
    },
  });
  mockModule(workflowStepHandlersPath, {
    handleWorkflowStep:
      handlerImpl ||
      (async (step) => ({
        status: "COMPLETED",
        output: {
          simulated: true,
          actionType: step.action_type,
        },
      })),
  });

  return {
    service: require(servicePath),
    calls,
  };
}

test("processWorkflowExecution validates execution IDs", async () => {
  const { service } = loadService();

  await assert.rejects(
    service.processWorkflowExecution({
      executionId: "not-a-uuid",
      processedBy: validUserId,
    }),
    (error) =>
      error.statusCode === 400 &&
      error.message === "Validation failed"
  );
});

test("processWorkflowExecution returns 404 for missing executions", async () => {
  const { service } = loadService({
    execution: null,
  });

  await assert.rejects(
    service.processWorkflowExecution({
      executionId: validExecutionId,
      processedBy: validUserId,
    }),
    (error) =>
      error.statusCode === 404 &&
      error.message === "Workflow execution not found"
  );
});

test("processWorkflowExecution blocks non-pending executions", async () => {
  const { service } = loadService({
    execution: {
      id: validExecutionId,
      workflow_id: "workflow-1",
      status: "COMPLETED",
    },
  });

  await assert.rejects(
    service.processWorkflowExecution({
      executionId: validExecutionId,
      processedBy: validUserId,
    }),
    (error) =>
      error.statusCode === 409 &&
      error.message === "Only PENDING workflow executions can be processed"
  );
});

test("processWorkflowExecution blocks executions without steps", async () => {
  const { service } = loadService({
    steps: [],
  });

  await assert.rejects(
    service.processWorkflowExecution({
      executionId: validExecutionId,
      processedBy: validUserId,
    }),
    (error) =>
      error.statusCode === 409 &&
      error.message === "Workflow execution has no steps to process"
  );
});

test("processWorkflowExecution returns 409 when the execution is already claimed", async () => {
  const { service, calls } = loadService({
    claimable: false,
  });

  await assert.rejects(
    service.processWorkflowExecution({
      executionId: validExecutionId,
      processedBy: validUserId,
    }),
    (error) =>
      error.statusCode === 409 &&
      error.message === "Only PENDING workflow executions can be processed"
  );

  assert.strictEqual(calls.claims.length, 1);
  assert.strictEqual(calls.executionUpdates.length, 0);
  assert.strictEqual(calls.stepUpdates.length, 0);
  assert.strictEqual(calls.audit.length, 0);
});

test("processWorkflowExecution processes steps in order and completes the execution", async () => {
  const { service, calls } = loadService();

  const result = await service.processWorkflowExecution({
    executionId: validExecutionId,
    processedBy: validUserId,
  });

  assert.strictEqual(calls.claims.length, 1);
  assert.strictEqual(calls.claims[0].id, validExecutionId);
  assert.deepStrictEqual(
    calls.executionUpdates.map((update) => update.status),
    ["COMPLETED"]
  );
  assert.deepStrictEqual(
    calls.stepUpdates.map((update) => update.status),
    ["RUNNING", "COMPLETED", "RUNNING", "COMPLETED"]
  );
  assert.strictEqual(calls.executionUpdates.at(-1).result.stepsProcessed, 2);
  assert.deepStrictEqual(
    calls.executionUpdates.at(-1).result.steps.map((step) => step.stepOrder),
    [1, 2]
  );
  assert.deepStrictEqual(
    calls.audit.map((entry) => entry.action),
    [
      "WORKFLOW_EXECUTION_PROCESS_STARTED",
      "WORKFLOW_EXECUTION_PROCESS_COMPLETED",
    ]
  );
  assert.strictEqual(result.status, "COMPLETED");
});

test("processWorkflowExecution returns a failed execution when a handler fails", async () => {
  const { service, calls } = loadService({
    handlerImpl: async (step) => {
      if (step.id === "execution-step-2") {
        throw new Error("handler failed");
      }

      return {
        status: "COMPLETED",
        output: {
          simulated: true,
          actionType: step.action_type,
        },
      };
    },
  });

  const result = await service.processWorkflowExecution({
    executionId: validExecutionId,
    processedBy: validUserId,
  });

  assert.deepStrictEqual(
    calls.stepUpdates.map((update) => update.status),
    ["RUNNING", "COMPLETED", "RUNNING", "FAILED"]
  );
  assert.strictEqual(calls.stepUpdates[3].errorMessage, "handler failed");
  assert.strictEqual(calls.executionUpdates.at(-1).status, "FAILED");
  assert.strictEqual(
    calls.executionUpdates.at(-1).result.failedStep.error,
    "handler failed"
  );
  assert.strictEqual(calls.executionUpdates.at(-1).result.stepsProcessed, 1);
  assert.strictEqual(result.status, "FAILED");
  assert.deepStrictEqual(
    calls.audit.map((entry) => entry.action),
    [
      "WORKFLOW_EXECUTION_PROCESS_STARTED",
      "WORKFLOW_EXECUTION_PROCESS_FAILED",
    ]
  );
});

test("processWorkflowExecution stops processing steps after the first failure", async () => {
  const { service, calls } = loadService({
    steps: [
      {
        id: "execution-step-1",
        step_id: "step-1",
        step_order: 1,
        action_type: "MANUAL",
      },
      {
        id: "execution-step-2",
        step_id: "step-2",
        step_order: 2,
        action_type: "NOTIFICATION",
      },
      {
        id: "execution-step-3",
        step_id: "step-3",
        step_order: 3,
        action_type: "MANUAL",
      },
    ],
    handlerImpl: async (step) => {
      if (step.id === "execution-step-2") {
        throw new Error("second step failed");
      }

      return {
        status: "COMPLETED",
        output: {
          simulated: true,
          actionType: step.action_type,
        },
      };
    },
  });

  const result = await service.processWorkflowExecution({
    executionId: validExecutionId,
    processedBy: validUserId,
  });

  assert.deepStrictEqual(
    calls.stepUpdates.map((update) => update.id),
    [
      "execution-step-1",
      "execution-step-1",
      "execution-step-2",
      "execution-step-2",
    ]
  );
  assert.strictEqual(result.status, "FAILED");
  assert.strictEqual(calls.executionUpdates.at(-1).result.failedStep.stepOrder, 2);
});
