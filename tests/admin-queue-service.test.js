const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(
  __dirname,
  "../src/modules/admin/adminQueue.service.js"
);
const workflowProcessingQueuePath = path.join(
  __dirname,
  "../src/queues/workflowProcessing.queue.js"
);
const loggerPath = path.join(__dirname, "../src/config/logger.js");

function mockModule(modulePath, exports) {
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function loadService({ getJobCounts, getJobs, getJob } = {}) {
  const calls = {
    getJobCounts: [],
    getJobs: [],
    getJob: [],
  };

  [servicePath, workflowProcessingQueuePath, loggerPath].forEach(
    (modulePath) => delete require.cache[modulePath]
  );

  mockModule(loggerPath, {
    debug: () => {},
    info: () => {},
  });

  mockModule(workflowProcessingQueuePath, {
    WORKFLOW_PROCESSING_QUEUE_NAME: "workflow-processing",
    workflowProcessingQueue: {
      getJobCounts: async (...states) => {
        calls.getJobCounts.push(states);
        return getJobCounts ? getJobCounts(states) : {};
      },
      getJobs: async (states, start, end) => {
        calls.getJobs.push({ states, start, end });
        return getJobs ? getJobs(states, start, end) : [];
      },
      getJob: async (jobId) => {
        calls.getJob.push(jobId);
        return getJob ? getJob(jobId) : null;
      },
    },
  });

  return {
    service: require(servicePath),
    calls,
  };
}

function buildJob(overrides = {}) {
  return {
    id: "job-1",
    queueName: "workflow-processing",
    data: { executionId: "11111111-1111-4111-8111-111111111111" },
    attemptsMade: 1,
    opts: { attempts: 3 },
    failedReason: null,
    processedOn: Date.parse("2026-06-14T00:00:00.000Z"),
    finishedOn: Date.parse("2026-06-14T00:00:03.000Z"),
    timestamp: Date.parse("2026-06-13T23:59:59.000Z"),
    getState: async () => "failed",
    retry: async () => {},
    remove: async () => {},
    ...overrides,
  };
}

test("getQueueStats returns counts for all states and the queue name", async () => {
  const { service, calls } = loadService({
    getJobCounts: () => ({
      waiting: 1,
      active: 2,
      completed: 3,
      failed: 4,
      delayed: 0,
      paused: 0,
    }),
  });

  const result = await service.getQueueStats();

  assert.deepStrictEqual(calls.getJobCounts, [
    ["waiting", "active", "completed", "failed", "delayed", "paused"],
  ]);
  assert.deepStrictEqual(result, {
    queueName: "workflow-processing",
    counts: {
      waiting: 1,
      active: 2,
      completed: 3,
      failed: 4,
      delayed: 0,
      paused: 0,
    },
  });
});

test("listJobs returns formatted jobs with default pagination and state", async () => {
  const job = buildJob();
  const { service, calls } = loadService({
    getJobs: () => [job],
    getJobCounts: () => ({ failed: 1 }),
  });

  const result = await service.listJobs({});

  assert.deepStrictEqual(calls.getJobs, [
    { states: ["failed"], start: 0, end: 19 },
  ]);
  assert.deepStrictEqual(calls.getJobCounts, [["failed"]]);
  assert.strictEqual(result.state, "failed");
  assert.strictEqual(result.page, 1);
  assert.strictEqual(result.limit, 20);
  assert.strictEqual(result.total, 1);
  assert.deepStrictEqual(result.jobs, [
    {
      jobId: "job-1",
      queueName: "workflow-processing",
      executionId: "11111111-1111-4111-8111-111111111111",
      attemptsMade: 1,
      maxAttempts: 3,
      failedReason: null,
      processedOn: "2026-06-14T00:00:00.000Z",
      finishedOn: "2026-06-14T00:00:03.000Z",
      timestamp: "2026-06-13T23:59:59.000Z",
    },
  ]);
});

test("listJobs applies the requested state to getJobs and getJobCounts", async () => {
  const { service, calls } = loadService({
    getJobs: () => [],
    getJobCounts: () => ({ completed: 5 }),
  });

  const result = await service.listJobs({ state: "completed" });

  assert.deepStrictEqual(calls.getJobs, [
    { states: ["completed"], start: 0, end: 19 },
  ]);
  assert.deepStrictEqual(calls.getJobCounts, [["completed"]]);
  assert.strictEqual(result.state, "completed");
  assert.strictEqual(result.total, 5);
});

test("listJobs applies page and limit to the pagination window", async () => {
  const { service, calls } = loadService({
    getJobs: () => [],
    getJobCounts: () => ({ failed: 0 }),
  });

  await service.listJobs({ page: "2", limit: "10" });

  assert.deepStrictEqual(calls.getJobs, [
    { states: ["failed"], start: 10, end: 19 },
  ]);
});

test("listJobs rejects an invalid state", async () => {
  const { service } = loadService();

  await assert.rejects(
    service.listJobs({ state: "bogus" }),
    (error) => error.statusCode === 400 && error.message === "Validation failed"
  );
});

test("listJobs rejects page < 1", async () => {
  const { service } = loadService();

  await assert.rejects(
    service.listJobs({ page: "0" }),
    (error) => error.statusCode === 400 && error.message === "Validation failed"
  );
});

test("listJobs rejects limit > 100", async () => {
  const { service } = loadService();

  await assert.rejects(
    service.listJobs({ limit: "101" }),
    (error) => error.statusCode === 400 && error.message === "Validation failed"
  );
});

test("retryJob calls job.retry() and returns previous/new state", async () => {
  let retried = false;
  const job = buildJob({
    getState: async () => (retried ? "waiting" : "failed"),
    retry: async () => {
      retried = true;
    },
  });
  const { service } = loadService({ getJob: () => job });

  const result = await service.retryJob("job-1");

  assert.strictEqual(retried, true);
  assert.deepStrictEqual(result, {
    jobId: "job-1",
    executionId: "11111111-1111-4111-8111-111111111111",
    previousState: "failed",
    newState: "waiting",
  });
});

test("retryJob returns 404 when the job does not exist", async () => {
  const { service } = loadService({ getJob: () => null });

  await assert.rejects(
    service.retryJob("missing-job"),
    (error) => error.statusCode === 404 && error.message === "Job not found"
  );
});

test("retryJob returns 409 when the job is not in the failed state", async () => {
  const job = buildJob({ getState: async () => "active" });
  const { service } = loadService({ getJob: () => job });

  await assert.rejects(
    service.retryJob("job-1"),
    (error) => error.statusCode === 409
  );
});

test("retryJob returns 400 for an invalid jobId", async () => {
  const { service } = loadService();

  await assert.rejects(
    service.retryJob(""),
    (error) => error.statusCode === 400 && error.message === "Validation failed"
  );
});

test("deleteJob removes a completed job and returns the deleted state", async () => {
  let removed = false;
  const job = buildJob({
    getState: async () => "completed",
    remove: async () => {
      removed = true;
    },
  });
  const { service } = loadService({ getJob: () => job });

  const result = await service.deleteJob("job-1");

  assert.strictEqual(removed, true);
  assert.deepStrictEqual(result, {
    jobId: "job-1",
    executionId: "11111111-1111-4111-8111-111111111111",
    deletedState: "completed",
  });
});

test("deleteJob removes a failed job and returns the deleted state", async () => {
  let removed = false;
  const job = buildJob({
    getState: async () => "failed",
    remove: async () => {
      removed = true;
    },
  });
  const { service } = loadService({ getJob: () => job });

  const result = await service.deleteJob("job-1");

  assert.strictEqual(removed, true);
  assert.strictEqual(result.deletedState, "failed");
});

test("deleteJob returns 409 when the job is active", async () => {
  const job = buildJob({ getState: async () => "active" });
  const { service } = loadService({ getJob: () => job });

  await assert.rejects(
    service.deleteJob("job-1"),
    (error) => error.statusCode === 409
  );
});

test("deleteJob returns 409 when the job is waiting", async () => {
  const job = buildJob({ getState: async () => "waiting" });
  const { service } = loadService({ getJob: () => job });

  await assert.rejects(
    service.deleteJob("job-1"),
    (error) => error.statusCode === 409
  );
});

test("deleteJob returns 404 when the job does not exist", async () => {
  const { service } = loadService({ getJob: () => null });

  await assert.rejects(
    service.deleteJob("missing-job"),
    (error) => error.statusCode === 404 && error.message === "Job not found"
  );
});

test("deleteJob returns 400 for an invalid jobId", async () => {
  const { service } = loadService();

  await assert.rejects(
    service.deleteJob(""),
    (error) => error.statusCode === 400 && error.message === "Validation failed"
  );
});
