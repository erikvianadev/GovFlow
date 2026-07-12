const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(
  __dirname,
  "../../src/modules/workflow-processing/workflowProcessingQueue.service.js"
);
const workflowExecutionsRepositoryPath = path.join(
  __dirname,
  "../../src/modules/workflow-executions/workflowExecutions.repository.js"
);
const workflowProcessingQueuePath = path.join(
  __dirname,
  "../../src/queues/workflowProcessing.queue.js"
);

const validExecutionId = "11111111-1111-4111-8111-111111111111";
const validUserId = "22222222-2222-4222-8222-222222222222";
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

function loadService({
  execution = {
    id: validExecutionId,
    workflow_id: "workflow-1",
    status: "PENDING",
  },
} = {}) {
  const calls = {
    queueAdds: [],
  };

  [
    servicePath,
    workflowExecutionsRepositoryPath,
    workflowProcessingQueuePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(workflowExecutionsRepositoryPath, {
    findById: async () => execution,
  });
  mockModule(workflowProcessingQueuePath, {
    buildWorkflowProcessingJobId: (executionId) =>
      `workflow-execution-${executionId}`,
    workflowProcessingQueue: {
      add: async (name, data, options) => {
        calls.queueAdds.push({ name, data, options });

        return {
          id: options.jobId,
          queueName: "workflow-processing",
        };
      },
    },
  });

  return {
    service: require(servicePath),
    calls,
  };
}

test("enqueueWorkflowExecutionProcessing validates execution IDs", async () => {
  const { service } = loadService();

  await assert.rejects(
    service.enqueueWorkflowExecutionProcessing({
      executionId: "not-a-uuid",
      processedBy: validUserId,
    }),
    (error) =>
      error.statusCode === 400 && error.message === "Validation failed"
  );
});

test("enqueueWorkflowExecutionProcessing requires an authenticated user", async () => {
  const { service } = loadService();

  await assert.rejects(
    service.enqueueWorkflowExecutionProcessing({
      executionId: validExecutionId,
    }),
    (error) =>
      error.statusCode === 401 &&
      error.message === "Authenticated user is required"
  );
});

test("enqueueWorkflowExecutionProcessing returns 404 for missing executions", async () => {
  const { service } = loadService({
    execution: null,
  });

  await assert.rejects(
    service.enqueueWorkflowExecutionProcessing({
      executionId: validExecutionId,
      processedBy: validUserId,
      requester: adminRequester,
    }),
    (error) =>
      error.statusCode === 404 &&
      error.message === "Workflow execution not found"
  );
});

test("enqueueWorkflowExecutionProcessing returns 404 for a manager from another department", async () => {
  const { service, calls } = loadService({
    execution: {
      id: validExecutionId,
      workflow_id: "workflow-1",
      department_id: departmentA,
      status: "PENDING",
    },
  });

  await assert.rejects(
    service.enqueueWorkflowExecutionProcessing({
      executionId: validExecutionId,
      processedBy: validUserId,
      requester: { role: "MANAGER", department_id: departmentB },
    }),
    (error) =>
      error.statusCode === 404 &&
      error.message === "Workflow execution not found"
  );

  // No external side effect (queue add) once access is denied.
  assert.deepStrictEqual(calls.queueAdds, []);
});

test("enqueueWorkflowExecutionProcessing blocks non-pending executions", async () => {
  const { service } = loadService({
    execution: {
      id: validExecutionId,
      workflow_id: "workflow-1",
      status: "COMPLETED",
    },
  });

  await assert.rejects(
    service.enqueueWorkflowExecutionProcessing({
      executionId: validExecutionId,
      processedBy: validUserId,
      requester: adminRequester,
    }),
    (error) =>
      error.statusCode === 409 &&
      error.message === "Only PENDING workflow executions can be queued"
  );
});

test("enqueueWorkflowExecutionProcessing adds a workflow processing job", async () => {
  const { service, calls } = loadService();

  const result = await service.enqueueWorkflowExecutionProcessing({
    executionId: validExecutionId,
    processedBy: validUserId,
    requester: adminRequester,
  });

  assert.deepStrictEqual(calls.queueAdds, [
    {
      name: "process-workflow-execution",
      data: {
        executionId: validExecutionId,
        processedBy: validUserId,
      },
      options: {
        jobId: `workflow-execution-${validExecutionId}`,
      },
    },
  ]);
  assert.deepStrictEqual(result, {
    jobId: `workflow-execution-${validExecutionId}`,
    queueName: "workflow-processing",
    executionId: validExecutionId,
    status: "QUEUED",
  });
});
