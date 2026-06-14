const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingQueue.service.js"
);
const workflowExecutionsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutions.repository.js"
);
const workflowProcessingQueuePath = path.join(
  __dirname,
  "../src/queues/workflowProcessing.queue.js"
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
      requestedBy: validUserId,
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
      requestedBy: validUserId,
    }),
    (error) =>
      error.statusCode === 404 &&
      error.message === "Workflow execution not found"
  );
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
      requestedBy: validUserId,
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
    requestedBy: validUserId,
  });

  assert.deepStrictEqual(calls.queueAdds, [
    {
      name: "process-workflow-execution",
      data: {
        executionId: validExecutionId,
        requestedBy: validUserId,
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
