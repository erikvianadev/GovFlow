const VALID_JOB_STATES = ["waiting", "active", "completed", "failed", "delayed"];
const MAX_JOBS_LIMIT = 100;
const DEFAULT_JOBS_LIMIT = 20;
const DEFAULT_JOBS_PAGE = 1;

function validateListJobsFilters({ state, page, limit }) {
  const errors = [];

  if (state !== undefined && !VALID_JOB_STATES.includes(state)) {
    errors.push({
      field: "state",
      message: `state must be one of: ${VALID_JOB_STATES.join(", ")}`,
    });
  }

  const parsedPage = Number(page);
  if (page !== undefined && (!Number.isInteger(parsedPage) || parsedPage < 1)) {
    errors.push({ field: "page", message: "page must be a positive integer" });
  }

  const parsedLimit = Number(limit);
  if (
    limit !== undefined &&
    (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_JOBS_LIMIT)
  ) {
    errors.push({
      field: "limit",
      message: `limit must be an integer between 1 and ${MAX_JOBS_LIMIT}`,
    });
  }

  return errors;
}

function validateJobId(jobId) {
  const errors = [];

  if (!jobId || typeof jobId !== "string" || jobId.trim() === "") {
    errors.push({ field: "jobId", message: "jobId is required" });
  }

  return errors;
}

module.exports = {
  DEFAULT_JOBS_LIMIT,
  DEFAULT_JOBS_PAGE,
  MAX_JOBS_LIMIT,
  VALID_JOB_STATES,
  validateJobId,
  validateListJobsFilters,
};
