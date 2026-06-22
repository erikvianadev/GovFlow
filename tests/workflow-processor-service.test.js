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
      status: "PENDING",
    },
    {
      id: "execution-step-2",
      step_id: "step-2",
      step_order: 2,
      action_type: "NOTIFICATION",
      status: "PENDING",
    },
  ],
  handlerImpl,
  claimPendingStepImpl,
  claimable = true,
  concurrentlyFinalized = false,
  postFinalizeExecution = {
    id: validExecutionId,
    workflow_id: "workflow-1",
    status: "FAILED",
    result: { recoveryReason: "Execution timed out while running" },
  },
} = {}) {
  const trx = {
    query: async () => ({ rows: [] }),
  };
  const calls = {
    audit: [],
    claims: [],
    executionUpdates: [],
    stepUpdates: [],
    stepClaims: [],
    handlerSteps: [],
  };

  [
    servicePath,
    workflowExecutionsRepositoryPath,
    workflowExecutionStepsRepositoryPath,
    safeAuditLogPath,
    workflowStepHandlersPath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  let findByIdCalls = 0;

  mockModule(workflowExecutionsRepositoryPath, {
    findById: async () => {
      findByIdCalls += 1;

      // The first lookup resolves the execution to process; later lookups
      // reflect any state set concurrently (e.g. by the stale recovery).
      if (findByIdCalls === 1) {
        return execution;
      }

      return postFinalizeExecution;
    },
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
    finalizeRunningExecution: async (payload, db) => {
      assert.strictEqual(db, undefined);
      calls.executionUpdates.push(payload);

      if (concurrentlyFinalized) {
        return undefined;
      }

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
    claimPendingStep: async (payload, db) => {
      assert.strictEqual(db, undefined);
      calls.stepClaims.push(payload);

      if (claimPendingStepImpl) {
        return claimPendingStepImpl(payload);
      }

      const step = steps.find((candidate) => candidate.id === payload.id);
      const status = step && step.status ? step.status : "PENDING";

      // Mirror the repository guard: only a PENDING step is claimable.
      return status === "PENDING" ? { id: payload.id, status: "RUNNING" } : undefined;
    },
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
    handleWorkflowStepWithContext:
      async (context) => {
        calls.handlerSteps.push(context.step.id);

        if (handlerImpl) {
          return handlerImpl(context.step, context);
        }

        return {
          status: "COMPLETED",
          output: {
            simulated: true,
            actionType: context.step.action_type,
          },
        };
      },
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
      error.message ===
        "Only PENDING or RUNNING workflow executions can be processed"
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
    calls.stepClaims.map((claim) => claim.id),
    ["execution-step-1", "execution-step-2"]
  );
  assert.deepStrictEqual(
    calls.stepUpdates.map((update) => update.status),
    ["COMPLETED", "COMPLETED"]
  );
  assert.strictEqual(calls.executionUpdates.at(-1).result.stepsProcessed, 2);
  assert.deepStrictEqual(
    calls.executionUpdates.at(-1).result.steps.map((step) => step.stepOrder),
    [1, 2]
  );
  // The same enriched output (with idempotencyKey) is persisted on the step and
  // mirrored into the aggregated execution result.
  assert.strictEqual(
    calls.stepUpdates[0].output.idempotencyKey,
    "workflowExecutionStep:execution-step-1"
  );
  assert.strictEqual(
    calls.executionUpdates.at(-1).result.steps[0].output.idempotencyKey,
    "workflowExecutionStep:execution-step-1"
  );
  assert.deepStrictEqual(
    calls.stepUpdates[0].output,
    calls.executionUpdates.at(-1).result.steps[0].output
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

test("processWorkflowExecution can resume a RUNNING execution for retry", async () => {
  const { service, calls } = loadService({
    execution: {
      id: validExecutionId,
      workflow_id: "workflow-1",
      status: "RUNNING",
    },
  });

  const result = await service.processWorkflowExecution({
    executionId: validExecutionId,
    processedBy: validUserId,
  });

  assert.strictEqual(calls.claims.length, 0);
  assert.strictEqual(calls.stepClaims.length, 2);
  assert.deepStrictEqual(
    calls.stepUpdates.map((update) => update.status),
    ["COMPLETED", "COMPLETED"]
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
    ["COMPLETED", "FAILED"]
  );
  assert.strictEqual(calls.stepUpdates[1].errorMessage, "handler failed");
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

test("processWorkflowExecution does not overwrite an execution finalized concurrently", async () => {
  const { service, calls } = loadService({
    concurrentlyFinalized: true,
  });

  const result = await service.processWorkflowExecution({
    executionId: validExecutionId,
    processedBy: validUserId,
  });

  // The guarded finalize matched no rows, so the worker reports the existing
  // terminal state (recovered as FAILED) instead of forcing it to COMPLETED.
  assert.strictEqual(result.status, "FAILED");
  assert.strictEqual(calls.executionUpdates.at(-1).status, "COMPLETED");
  assert.deepStrictEqual(
    calls.audit.map((entry) => entry.action),
    [
      "WORKFLOW_EXECUTION_PROCESS_STARTED",
      "WORKFLOW_EXECUTION_PROCESS_SKIPPED",
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
    ["execution-step-1", "execution-step-2"]
  );
  assert.deepStrictEqual(
    calls.stepUpdates.map((update) => update.status),
    ["COMPLETED", "FAILED"]
  );
  assert.strictEqual(result.status, "FAILED");
  assert.strictEqual(calls.executionUpdates.at(-1).result.failedStep.stepOrder, 2);
});

test("processWorkflowExecution propagates retryable technical step failures", async () => {
  const technicalError = new Error("Temporary Jira comment request failure");
  technicalError.isRetryable = true;
  const { service, calls } = loadService({
    handlerImpl: async () => {
      throw technicalError;
    },
  });

  await assert.rejects(
    service.processWorkflowExecution({
      executionId: validExecutionId,
      processedBy: validUserId,
    }),
    (error) => error === technicalError
  );

  assert.deepStrictEqual(
    calls.stepUpdates.map((update) => update.status),
    ["PENDING"]
  );
  assert.strictEqual(calls.stepUpdates[0].errorMessage, technicalError.message);
  assert.strictEqual(calls.executionUpdates.length, 0);
  assert.deepStrictEqual(
    calls.audit.map((entry) => entry.action),
    [
      "WORKFLOW_EXECUTION_PROCESS_STARTED",
      "WORKFLOW_EXECUTION_PROCESS_TECHNICAL_FAILURE",
    ]
  );
});

test("processWorkflowExecution skips an already COMPLETED step without re-running its handler", async () => {
  const { service, calls } = loadService({
    execution: {
      id: validExecutionId,
      workflow_id: "workflow-1",
      status: "RUNNING",
    },
    steps: [
      {
        id: "execution-step-1",
        step_id: "step-1",
        step_order: 1,
        action_type: "JIRA_COMMENT",
        status: "COMPLETED",
        output: {
          provider: "jira",
          operation: "comment",
          issueKey: "DO-32",
          commentId: "10235",
          idempotencyKey: "workflowExecutionStep:execution-step-1",
        },
      },
      {
        id: "execution-step-2",
        step_id: "step-2",
        step_order: 2,
        action_type: "NOTIFICATION",
        status: "PENDING",
      },
    ],
  });

  const result = await service.processWorkflowExecution({
    executionId: validExecutionId,
    processedBy: validUserId,
  });

  // Both steps are claim-attempted, but only the PENDING one reaches the
  // handler: the COMPLETED step is skipped instead of re-invoking Jira.
  assert.deepStrictEqual(
    calls.stepClaims.map((claim) => claim.id),
    ["execution-step-1", "execution-step-2"]
  );
  assert.deepStrictEqual(calls.handlerSteps, ["execution-step-2"]);

  // The skipped step reuses its persisted output (commentId + idempotencyKey),
  // not a placeholder, keeping the step count and ordering intact.
  const resultSteps = calls.executionUpdates.at(-1).result.steps;
  assert.deepStrictEqual(
    resultSteps.map((step) => step.stepOrder),
    [1, 2]
  );
  assert.strictEqual(resultSteps[0].output.commentId, "10235");
  assert.strictEqual(
    resultSteps[0].output.idempotencyKey,
    "workflowExecutionStep:execution-step-1"
  );
  assert.ok(
    calls.audit.some(
      (entry) =>
        entry.action === "WORKFLOW_EXECUTION_STEP_SKIPPED" &&
        entry.metadata.reason === "already_completed"
    )
  );
  assert.strictEqual(result.status, "COMPLETED");
});

test("processWorkflowExecution falls back to a placeholder for a legacy COMPLETED step without persisted output", async () => {
  const { service, calls } = loadService({
    execution: {
      id: validExecutionId,
      workflow_id: "workflow-1",
      status: "RUNNING",
    },
    steps: [
      {
        id: "execution-step-1",
        step_id: "step-1",
        step_order: 1,
        action_type: "JIRA_COMMENT",
        status: "COMPLETED",
        // No `output`: step completed before the output column existed.
      },
    ],
  });

  const result = await service.processWorkflowExecution({
    executionId: validExecutionId,
    processedBy: validUserId,
  });

  assert.deepStrictEqual(calls.handlerSteps, []);
  assert.deepStrictEqual(calls.executionUpdates.at(-1).result.steps[0].output, {
    skipped: true,
    reason: "already_completed",
  });
  assert.strictEqual(result.status, "COMPLETED");
});

test("processWorkflowExecution raises a retryable error for a non-claimable RUNNING step", async () => {
  const { service, calls } = loadService({
    execution: {
      id: validExecutionId,
      workflow_id: "workflow-1",
      status: "RUNNING",
    },
    steps: [
      {
        id: "execution-step-1",
        step_id: "step-1",
        step_order: 1,
        action_type: "JIRA_COMMENT",
        status: "RUNNING",
      },
    ],
  });

  await assert.rejects(
    service.processWorkflowExecution({
      executionId: validExecutionId,
      processedBy: validUserId,
    }),
    (error) => error.isRetryable === true
  );

  // No handler call, no step mutation, no execution finalize: the step is left
  // for the next attempt / stale-running recovery.
  assert.deepStrictEqual(calls.handlerSteps, []);
  assert.strictEqual(calls.stepUpdates.length, 0);
  assert.strictEqual(calls.executionUpdates.length, 0);
  assert.ok(
    calls.audit.some(
      (entry) =>
        entry.action === "WORKFLOW_EXECUTION_STEP_SKIPPED" &&
        entry.metadata.reason === "running_unresolved"
    )
  );
});

test("processWorkflowExecution raises a retryable error when a PENDING step loses the claim race", async () => {
  const { service, calls } = loadService({
    execution: {
      id: validExecutionId,
      workflow_id: "workflow-1",
      status: "RUNNING",
    },
    steps: [
      {
        id: "execution-step-1",
        step_id: "step-1",
        step_order: 1,
        action_type: "JIRA_COMMENT",
        status: "PENDING",
      },
    ],
    // Snapshot is PENDING but the atomic claim matches no rows (lost race).
    claimPendingStepImpl: () => undefined,
  });

  await assert.rejects(
    service.processWorkflowExecution({
      executionId: validExecutionId,
      processedBy: validUserId,
    }),
    (error) => error.isRetryable === true
  );

  assert.deepStrictEqual(calls.handlerSteps, []);
  assert.strictEqual(calls.stepUpdates.length, 0);
  assert.strictEqual(calls.executionUpdates.length, 0);
  assert.ok(
    calls.audit.some(
      (entry) =>
        entry.action === "WORKFLOW_EXECUTION_STEP_SKIPPED" &&
        entry.metadata.reason === "claim_failed"
    )
  );
});
