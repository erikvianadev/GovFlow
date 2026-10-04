type ValidJobState = typeof VALID_JOB_STATES[number]

const VALID_JOB_STATES = ["waiting", "active", "completed", "failed", "delayed"] as const; 
const MAX_JOBS_LIMIT: number = 100;
const DEFAULT_JOBS_LIMIT: number = 20;
const DEFAULT_JOBS_PAGE: number = 1;

type ListJobsFilters = {
  state?: unknown;
  page?: unknown;
  limit?: unknown;
};

type ValidationError = {
  field: string;
  message: string;
}

function validateListJobsFilters({ state, page, limit }: ListJobsFilters): ValidationError[] {
  const errors: ValidationError[] = [];

  if (state !== undefined && isValidJobState(state)) {
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

function validateJobId(jobId: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!jobId || typeof jobId !== "string" || jobId.trim() === "") {
    errors.push({ field: "jobId", message: "jobId is required" });
  }

  return errors;
}

function isValidJobState(value: unknown): value is ValidJobState {
  if (typeof value !== 'string') {
    return false
  }

  return (VALID_JOB_STATES as readonly string[]).includes(value)
}

export = {
  DEFAULT_JOBS_LIMIT,
  DEFAULT_JOBS_PAGE,
  MAX_JOBS_LIMIT,
  VALID_JOB_STATES,
  validateJobId,
  validateListJobsFilters,
};
