const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(
  __dirname,
  "../src/modules/workflow-execution-steps/workflowExecutionSteps.service.js"
);
const workflowExecutionsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutions.repository.js"
);
const workflowExecutionStepsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflow-execution-steps/workflowExecutionSteps.repository.js"
);

const validExecutionId = "11111111-1111-4111-8111-111111111111";
const adminRequester = { role: "ADMIN" };
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

function loadService({ execution = { id: validExecutionId }, steps = [] } = {}) {
  const calls = {
    findById: null,
    findByExecutionId: null,
  };

  [
    servicePath,
    workflowExecutionsRepositoryPath,
    workflowExecutionStepsRepositoryPath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(workflowExecutionsRepositoryPath, {
    findById: async (id) => {
      calls.findById = id;
      return execution;
    },
  });
  mockModule(workflowExecutionStepsRepositoryPath, {
    findByExecutionId: async (id) => {
      calls.findByExecutionId = id;
      return steps;
    },
  });

  return {
    service: require(servicePath),
    calls,
  };
}

test("listWorkflowExecutionSteps validates execution IDs", async () => {
  const { service } = loadService();

  await assert.rejects(
    service.listWorkflowExecutionSteps({
      executionId: "not-a-uuid",
      requester: adminRequester,
    }),
    (error) =>
      error.statusCode === 400 &&
      error.message === "Validation failed" &&
      error.errors[0].message ===
        "Workflow execution ID must be a valid UUID"
  );
});

test("listWorkflowExecutionSteps returns 404 when execution does not exist", async () => {
  const { service, calls } = loadService({
    execution: null,
  });

  await assert.rejects(
    service.listWorkflowExecutionSteps({
      executionId: validExecutionId,
      requester: adminRequester,
    }),
    (error) =>
      error.statusCode === 404 &&
      error.message === "Workflow execution not found"
  );

  assert.strictEqual(calls.findById, validExecutionId);
  assert.strictEqual(calls.findByExecutionId, null);
});

test("listWorkflowExecutionSteps returns 404 for a manager from another department", async () => {
  const steps = [{ id: "execution-step-1" }];
  const { service, calls } = loadService({
    execution: { id: validExecutionId, department_id: departmentA },
    steps,
  });

  await assert.rejects(
    service.listWorkflowExecutionSteps({
      executionId: validExecutionId,
      requester: { role: "MANAGER", department_id: departmentB },
    }),
    (error) =>
      error.statusCode === 404 &&
      error.message === "Workflow execution not found"
  );

  // Steps must not be fetched once access is denied.
  assert.strictEqual(calls.findByExecutionId, null);
});

test("listWorkflowExecutionSteps returns steps for a manager of the same department", async () => {
  const steps = [{ id: "execution-step-1" }];
  const { service, calls } = loadService({
    execution: { id: validExecutionId, department_id: departmentA },
    steps,
  });

  const result = await service.listWorkflowExecutionSteps({
    executionId: validExecutionId,
    requester: { role: "MANAGER", department_id: departmentA },
  });

  assert.strictEqual(calls.findByExecutionId, validExecutionId);
  assert.deepStrictEqual(result, { items: steps });
});

test("listWorkflowExecutionSteps returns steps for an existing execution", async () => {
  const steps = [
    {
      id: "execution-step-1",
      step_order: 1,
      action_type: "MANUAL",
      configuration: null,
    },
  ];
  const { service, calls } = loadService({
    steps,
  });

  const result = await service.listWorkflowExecutionSteps({
    executionId: validExecutionId,
    requester: adminRequester,
  });

  assert.strictEqual(calls.findById, validExecutionId);
  assert.strictEqual(calls.findByExecutionId, validExecutionId);
  assert.deepStrictEqual(result, {
    items: steps,
  });
});
