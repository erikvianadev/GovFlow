const AppError = require("../../errors/AppError");
const logger = require("../../config/logger");
const {
  WORKFLOW_PROCESSING_QUEUE_NAME,
  workflowProcessingQueue,
} = require("../../queues/workflowProcessing.queue");
const {
  DEFAULT_JOBS_LIMIT,
  DEFAULT_JOBS_PAGE,
  validateJobId,
  validateListJobsFilters,
} = require("../../validators/adminQueue.validator");

// Only these states are safe to delete from outside the worker's lifecycle.
// "active" must never be deletable: the worker is processing it right now
// and removing it mid-flight produces undefined behavior (orphaned DB state,
// lost retries). "waiting"/"delayed" are excluded too: removing a job a user
// hasn't seen fail yet hides a legitimate pending execution from view.
const DELETABLE_STATES = ["completed", "failed"];

function formatJob(job) {
  return {
    jobId: job.id,
    queueName: job.queueName || WORKFLOW_PROCESSING_QUEUE_NAME,
    executionId: job.data?.executionId ?? null,
    attemptsMade: job.attemptsMade ?? 0,
    maxAttempts: job.opts?.attempts ?? null,
    failedReason: job.failedReason || null,
    processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : null,
  };
}

async function getQueueStats() {
  const counts = await workflowProcessingQueue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused"
  );

  logger.debug({ counts }, "Queue stats retrieved");

  return {
    queueName: WORKFLOW_PROCESSING_QUEUE_NAME,
    counts,
  };
}

async function listJobs({ state, page, limit } = {}) {
  const validationErrors = validateListJobsFilters({ state, page, limit });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const resolvedState = state || "failed";
  const resolvedLimit = Number(limit) || DEFAULT_JOBS_LIMIT;
  const resolvedPage = Number(page) || DEFAULT_JOBS_PAGE;

  const start = (resolvedPage - 1) * resolvedLimit;
  const end = start + resolvedLimit - 1;

  const jobs = await workflowProcessingQueue.getJobs(
    [resolvedState],
    start,
    end
  );

  const counts = await workflowProcessingQueue.getJobCounts(resolvedState);
  const total = counts[resolvedState] ?? 0;

  logger.debug(
    { state: resolvedState, page: resolvedPage, limit: resolvedLimit, total },
    "Queue jobs listed"
  );

  return {
    queueName: WORKFLOW_PROCESSING_QUEUE_NAME,
    state: resolvedState,
    page: resolvedPage,
    limit: resolvedLimit,
    total,
    jobs: jobs.map(formatJob),
  };
}

async function retryJob(jobId) {
  const validationErrors = validateJobId(jobId);

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const job = await workflowProcessingQueue.getJob(jobId);

  if (!job) {
    throw new AppError("Job not found", 404);
  }

  const state = await job.getState();

  if (state !== "failed") {
    throw new AppError(
      `Only failed jobs can be retried. Current state: ${state}`,
      409
    );
  }

  await job.retry();

  const newState = await job.getState();

  logger.info(
    { jobId, executionId: job.data?.executionId, previousState: "failed", newState },
    "Queue job retried"
  );

  return {
    jobId: job.id,
    executionId: job.data?.executionId ?? null,
    previousState: "failed",
    newState,
  };
}

async function deleteJob(jobId) {
  const validationErrors = validateJobId(jobId);

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const job = await workflowProcessingQueue.getJob(jobId);

  if (!job) {
    throw new AppError("Job not found", 404);
  }

  const state = await job.getState();

  // Guard added in review: job.remove() has no built-in state restriction.
  // Without this check, an ADMIN could delete a job the worker is actively
  // processing ("active"), producing undefined behavior on the worker side.
  if (!DELETABLE_STATES.includes(state)) {
    throw new AppError(
      `Only completed or failed jobs can be deleted. Current state: ${state}`,
      409
    );
  }

  await job.remove();

  logger.info(
    { jobId, executionId: job.data?.executionId, state },
    "Queue job deleted"
  );

  return {
    jobId: job.id,
    executionId: job.data?.executionId ?? null,
    deletedState: state,
  };
}

module.exports = {
  deleteJob,
  getQueueStats,
  listJobs,
  retryJob,
};
