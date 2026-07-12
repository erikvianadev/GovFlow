const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const workerPath = path.join(
  __dirname,
  "../../src/workers/workflowProcessing.worker.js"
);
const bullmqPath = require.resolve("bullmq");
const bullmqConfigPath = path.join(__dirname, "../../src/config/bullmq.js");
const workflowProcessingQueuePath = path.join(
  __dirname,
  "../../src/queues/workflowProcessing.queue.js"
);
const workflowProcessorServicePath = path.join(
  __dirname,
  "../../src/modules/workflow-processing/workflowProcessor.service.js"
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

function loadWorker({
  processorResult = {
    status: "COMPLETED",
  },
} = {}) {
  const calls = {
    processors: [],
    workers: [],
    listeners: [],
  };
  const bullMQConnection = {
    host: "redis",
    port: 6379,
  };

  [
    workerPath,
    bullmqPath,
    bullmqConfigPath,
    workflowProcessingQueuePath,
    workflowProcessorServicePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  class MockWorker {
    constructor(queueName, processor, options) {
      calls.workers.push({
        queueName,
        processor,
        options,
      });
    }

    on(eventName, handler) {
      calls.listeners.push({
        eventName,
        handler,
      });
    }
  }

  class MockUnrecoverableError extends Error {}

  mockModule(bullmqPath, {
    Worker: MockWorker,
    UnrecoverableError: MockUnrecoverableError,
  });
  mockModule(bullmqConfigPath, {
    bullMQConnection,
  });
  mockModule(workflowProcessingQueuePath, {
    WORKFLOW_PROCESSING_QUEUE_NAME: "workflow-processing",
  });
  mockModule(workflowProcessorServicePath, {
    processWorkflowExecution: async (payload) => {
      calls.processors.push(payload);
      return processorResult;
    },
  });

  return {
    workerModule: require(workerPath),
    calls,
    bullMQConnection,
    MockUnrecoverableError,
  };
}

test("createWorkflowProcessingWorker creates a BullMQ worker for the workflow processing queue", () => {
  const { workerModule, calls, bullMQConnection } = loadWorker();

  const worker = workerModule.createWorkflowProcessingWorker();

  assert.ok(worker);
  assert.strictEqual(calls.workers.length, 1);
  assert.strictEqual(calls.workers[0].queueName, "workflow-processing");
  assert.deepStrictEqual(calls.workers[0].options, {
    connection: bullMQConnection,
    concurrency: 1,
  });
});

test("createWorkflowProcessingWorker registers completed, failed, and error handlers", () => {
  const { workerModule, calls } = loadWorker();

  workerModule.createWorkflowProcessingWorker();

  assert.deepStrictEqual(
    calls.listeners.map((listener) => listener.eventName),
    ["completed", "failed", "error"]
  );
});

test("workflow processing worker calls the processor with executionId and processedBy", async () => {
  const { workerModule, calls } = loadWorker({
    processorResult: {
      status: "COMPLETED",
    },
  });

  workerModule.createWorkflowProcessingWorker();

  const result = await calls.workers[0].processor({
    id: "job-1",
    data: {
      executionId: validExecutionId,
      processedBy: validUserId,
    },
  });

  assert.deepStrictEqual(calls.processors, [
    {
      executionId: validExecutionId,
      processedBy: validUserId,
    },
  ]);
  assert.deepStrictEqual(result, {
    executionId: validExecutionId,
    status: "COMPLETED",
  });
});

test("workflow processing worker fails business failures without retry", async () => {
  const { workerModule, calls, MockUnrecoverableError } = loadWorker({
    processorResult: {
      status: "FAILED",
      result: {
        failedStep: {
          error: "Simulated async processor failure",
        },
      },
    },
  });

  workerModule.createWorkflowProcessingWorker();

  await assert.rejects(
    calls.workers[0].processor({
      id: "job-1",
      data: {
        executionId: validExecutionId,
        processedBy: validUserId,
      },
    }),
    (error) =>
      error instanceof MockUnrecoverableError &&
      error.message === "Simulated async processor failure"
  );
});

test("workflow processing worker requires executionId in job data", async () => {
  const { workerModule, calls, MockUnrecoverableError } = loadWorker();

  workerModule.createWorkflowProcessingWorker();

  await assert.rejects(
    calls.workers[0].processor({
      id: "job-1",
      data: {
        processedBy: validUserId,
      },
    }),
    (error) =>
      error instanceof MockUnrecoverableError &&
      error.message === "Job data must include executionId"
  );
  assert.deepStrictEqual(calls.processors, []);
});

test("workflow processing worker requires processedBy in job data", async () => {
  const { workerModule, calls, MockUnrecoverableError } = loadWorker();

  workerModule.createWorkflowProcessingWorker();

  await assert.rejects(
    calls.workers[0].processor({
      id: "job-1",
      data: {
        executionId: validExecutionId,
      },
    }),
    (error) =>
      error instanceof MockUnrecoverableError &&
      error.message === "Job data must include processedBy"
  );
  assert.deepStrictEqual(calls.processors, []);
});

test("workflow processing worker uses retryable errors for technical failures", async () => {
  const { workerModule, calls, MockUnrecoverableError } = loadWorker();

  workerModule.createWorkflowProcessingWorker();

  await assert.rejects(
    calls.workers[0].processor({
      id: "job-1",
      data: {
        executionId: validExecutionId,
        processedBy: validUserId,
        simulateTechnicalFailure: true,
      },
    }),
    (error) =>
      !(error instanceof MockUnrecoverableError) &&
      error.message === "Simulated technical failure"
  );
  assert.deepStrictEqual(calls.processors, []);
});
