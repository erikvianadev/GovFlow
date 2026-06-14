const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingJob.service.js"
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
    status: "PENDING",
  },
  job = null,
} = {}) {
  const calls = {
    getJobs: [],
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
    WORKFLOW_PROCESSING_QUEUE_NAME: "workflow-processing",
    buildWorkflowProcessingJobId: (executionId) =>
      `workflow-execution-${executionId}`,
    workflowProcessingQueue: {
      getJob: async (jobId) => {
        calls.getJobs.push(jobId);
        return job;
      },
    },
  });

  return {
    service: require(servicePath),
    calls,
  };
}

test("getWorkflowExecutionProcessingJobStatus validates execution IDs", async () => {
  const { service } = loadService();

  await assert.rejects(
    service.getWorkflowExecutionProcessingJobStatus("not-a-uuid"),
    (error) =>
      error.statusCode === 400 && error.message === "Validation failed"
  );
});

test("getWorkflowExecutionProcessingJobStatus returns 404 for missing executions", async () => {
  const { service } = loadService({
    execution: null,
  });

  await assert.rejects(
    service.getWorkflowExecutionProcessingJobStatus(validExecutionId),
    (error) =>
      error.statusCode === 404 &&
      error.message === "Workflow execution not found"
  );
});

test("getWorkflowExecutionProcessingJobStatus returns not_found when no queue job exists", async () => {
  const { service, calls } = loadService();

  const result = await service.getWorkflowExecutionProcessingJobStatus(
    validExecutionId
  );

  assert.deepStrictEqual(calls.getJobs, [
    `workflow-execution-${validExecutionId}`,
  ]);
  assert.deepStrictEqual(result, {
    executionId: validExecutionId,
    jobId: `workflow-execution-${validExecutionId}`,
    queueName: "workflow-processing",
      state: "not_found",
      attemptsMade: 0,
      attemptsStarted: 0,
      maxAttempts: null,
      failedReason: null,
    processedOn: null,
    finishedOn: null,
  });
});

test("getWorkflowExecutionProcessingJobStatus returns BullMQ job details", async () => {
  const { service } = loadService({
    job: {
      id: `workflow-execution-${validExecutionId}`,
      queueName: "workflow-processing",
      attemptsMade: 1,
      attemptsStarted: 1,
      opts: {
        attempts: 3,
      },
      failedReason: null,
      processedOn: Date.parse("2026-06-14T00:00:00.000Z"),
      finishedOn: Date.parse("2026-06-14T00:00:03.000Z"),
      getState: async () => "completed",
    },
  });

  const result = await service.getWorkflowExecutionProcessingJobStatus(
    validExecutionId
  );

  assert.deepStrictEqual(result, {
    executionId: validExecutionId,
    jobId: `workflow-execution-${validExecutionId}`,
    queueName: "workflow-processing",
    state: "completed",
    attemptsMade: 1,
    attemptsStarted: 1,
    maxAttempts: 3,
    failedReason: null,
    processedOn: "2026-06-14T00:00:00.000Z",
    finishedOn: "2026-06-14T00:00:03.000Z",
  });
});

test("getWorkflowExecutionProcessingJobStatus returns failed job details", async () => {
  const { service } = loadService({
    job: {
      id: `workflow-execution-${validExecutionId}`,
      attemptsMade: 2,
      attemptsStarted: 2,
      opts: {
        attempts: 3,
      },
      failedReason: "processor failed",
      processedOn: Date.parse("2026-06-14T00:00:00.000Z"),
      finishedOn: Date.parse("2026-06-14T00:00:03.000Z"),
      getState: async () => "failed",
    },
  });

  const result = await service.getWorkflowExecutionProcessingJobStatus(
    validExecutionId
  );

  assert.strictEqual(result.state, "failed");
  assert.strictEqual(result.attemptsMade, 2);
  assert.strictEqual(result.attemptsStarted, 2);
  assert.strictEqual(result.maxAttempts, 3);
  assert.strictEqual(result.failedReason, "processor failed");
  assert.strictEqual(result.queueName, "workflow-processing");
});
