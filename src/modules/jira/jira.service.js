const jiraClient = require("./jira.client");
const AppError = require("../../errors/AppError");
const env = require("../../config/env");
const logger = require("../../config/logger");
const { JiraBusinessError, JiraTechnicalError } = require("./jira.errors");

async function testConnection() {
  if (!jiraClient) {
    throw new AppError("Jira client not available", 500);
  }

  if (!env.jira.enabled) {
    throw new AppError("Jira integration is disabled", 400);
  }

  if (!env.jira.baseUrl || !env.jira.email || !env.jira.apiToken) {
    throw new AppError("Jira integration is not configured", 500);
  }

  logger.debug("Calling Jira: test connection");

  try {
    const user = await jiraClient.getMyself();

    logger.info(
      { accountId: user.accountId },
      "Jira call succeeded: test connection"
    );

    return {
      connected: true,
      accountId: user.accountId,
      displayName: user.displayName,
      emailAddress: user.emailAddress,
    };
  } catch (error) {
    // Route the raw axios error through normalizeJiraError so neither the log
    // below nor the error.middleware ever sees error.config.headers (the Jira
    // Basic Auth header). normalizeJiraError is hoisted (function declaration).
    const normalizedError = normalizeJiraError(error, "test connection");

    logger.error({ err: normalizedError }, "Jira call failed: test connection");

    throw normalizedError;
  }
}

function buildJiraCommentBody(text) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
    ],
  };
}

// Single source of truth for the marker GovFlow embeds in every JIRA_COMMENT
// body (see handleJiraCommentStep in workflowStepHandlers.js). Centralizing it
// here means the text written when a comment is created and the text searched
// for during remote-assisted recovery can never drift apart.
function buildExecutionStepMarker(executionStepId) {
  return `GovFlow executionStepId: ${executionStepId}`;
}

function isJiraReady() {
  return Boolean(
    jiraClient &&
      env.jira.enabled &&
      env.jira.baseUrl &&
      env.jira.email &&
      env.jira.apiToken
  );
}

// Flatten Atlassian Document Format (ADF) nodes to plain text so the marker
// string can be located regardless of nesting (paragraphs, text runs, etc.).
function extractAdfPlainText(node) {
  if (!node) {
    return "";
  }

  if (typeof node.text === "string") {
    return node.text;
  }

  if (Array.isArray(node.content)) {
    return node.content.map(extractAdfPlainText).join("");
  }

  return "";
}

const COMMENT_LOOKUP_PAGE_SIZE = 50;
const COMMENT_LOOKUP_MAX_PAGES = 3;

// Read-only, remote-assisted dedup check used by stale-running recovery
// (Sprint 6.4.3). Looks for a comment already carrying this execution step's
// marker so a crash between "Jira returned success" and "GovFlow persisted
// the output" does not get recorded as a false FAILED.
//
// Contract: this function NEVER throws. Jira being disabled, misconfigured,
// unreachable, or returning an error all resolve to `null` ("could not
// verify"), so callers can safely fall back to their existing safe default
// without any extra error handling. This is local-search verification, not a
// guarantee: results are best-effort, bounded by COMMENT_LOOKUP_MAX_PAGES,
// and only ever used to additionally confirm a comment exists — never to call
// Jira again.
async function findCommentByExecutionStepMarker({ issueKey, executionStepId }) {
  if (!isJiraReady() || !issueKey || !executionStepId) {
    return null;
  }

  const marker = buildExecutionStepMarker(executionStepId);

  try {
    let startAt = 0;

    for (let page = 0; page < COMMENT_LOOKUP_MAX_PAGES; page += 1) {
      const response = await jiraClient.get(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
        {
          params: {
            orderBy: "-created",
            maxResults: COMMENT_LOOKUP_PAGE_SIZE,
            startAt,
          },
        }
      );

      const comments = response?.comments || [];
      const match = comments.find((comment) =>
        extractAdfPlainText(comment.body).includes(marker)
      );

      if (match) {
        return {
          commentId: match.id,
          issueKey,
          created: match.created,
        };
      }

      startAt += comments.length;

      const total = response?.total ?? startAt;

      if (comments.length < COMMENT_LOOKUP_PAGE_SIZE || startAt >= total) {
        break;
      }
    }

    return null;
  } catch (error) {
    // normalizeJiraError strips the raw axios error down to safe fields, so the
    // Authorization header (Jira Basic Auth) never reaches the log here. The
    // normalized error is only used for logging; the contract still resolves to
    // null without ever throwing.
    logger.error(
      { executionStepId, issueKey, err: normalizeJiraError(error, "comment lookup") },
      "Jira comment lookup failed"
    );

    return null;
  }
}

function assertJiraIntegrationReady() {
  if (!jiraClient) {
    throw new JiraTechnicalError("Jira client not available");
  }

  if (!env.jira.enabled) {
    throw new JiraBusinessError("Jira integration is disabled", 400);
  }

  if (!env.jira.baseUrl || !env.jira.email || !env.jira.apiToken) {
    throw new JiraTechnicalError("Jira integration is not configured");
  }
}

function normalizeJiraError(error, operation) {
  const status = error.response?.status;

  if ([400, 401, 403, 404].includes(status)) {
    return new JiraBusinessError(
      `Jira rejected ${operation} request with status ${status}`,
      status
    );
  }

  if (status === 429 || status >= 500 || error.code || !error.response) {
    return new JiraTechnicalError(
      `Temporary Jira ${operation} request failure`,
      error
    );
  }

  return new JiraTechnicalError(
    `Unexpected Jira ${operation} request failure`,
    error
  );
}

async function addCommentToIssue({ issueKey, comment }) {
  assertJiraIntegrationReady();

  logger.debug({ issueKey }, "Calling Jira: add comment");

  try {
    const response = await jiraClient.post(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      {
        body: buildJiraCommentBody(comment),
      }
    );

    logger.info(
      { issueKey, commentId: response.id },
      "Jira call succeeded: add comment"
    );

    return {
      commentId: response.id,
      issueKey,
      self: response.self,
      created: response.created,
    };
  } catch (error) {
    const normalizedError = normalizeJiraError(error, "comment");

    logger.error(
      { issueKey, err: normalizedError },
      "Jira call failed: add comment"
    );

    throw normalizedError;
  }
}

async function transitionIssue({ issueKey, transitionId }) {
  assertJiraIntegrationReady();

  logger.debug({ issueKey, transitionId }, "Calling Jira: transition issue");

  try {
    await jiraClient.post(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      {
        transition: {
          id: transitionId,
        },
      }
    );

    logger.info(
      { issueKey, transitionId },
      "Jira call succeeded: transition issue"
    );

    return {
      issueKey,
      transitionId,
      status: "completed",
    };
  } catch (error) {
    const normalizedError = normalizeJiraError(error, "transition");

    logger.error(
      { issueKey, transitionId, err: normalizedError },
      "Jira call failed: transition issue"
    );

    throw normalizedError;
  }
}

module.exports = {
  addCommentToIssue,
  buildExecutionStepMarker,
  buildJiraCommentBody,
  findCommentByExecutionStepMarker,
  testConnection,
  transitionIssue,
};
