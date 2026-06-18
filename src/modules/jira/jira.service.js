const jiraClient = require("./jira.client");
const AppError = require("../../errors/AppError");
const env = require("../../config/env");
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

  const user = await jiraClient.getMyself();

  return {
    connected: true,
    accountId: user.accountId,
    displayName: user.displayName,
    emailAddress: user.emailAddress,
  };
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

function assertJiraCommentIntegrationReady() {
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

function normalizeJiraError(error) {
  const status = error.response?.status;

  if ([400, 403, 404].includes(status)) {
    return new JiraBusinessError(
      `Jira rejected comment request with status ${status}`,
      status
    );
  }

  if (status === 429 || status >= 500 || error.code || !error.response) {
    return new JiraTechnicalError("Temporary Jira comment request failure", error);
  }

  return new JiraTechnicalError("Unexpected Jira comment request failure", error);
}

async function addCommentToIssue({ issueKey, comment }) {
  assertJiraCommentIntegrationReady();

  try {
    const response = await jiraClient.post(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      {
        body: buildJiraCommentBody(comment),
      }
    );

    return {
      commentId: response.id,
      issueKey,
      self: response.self,
      created: response.created,
    };
  } catch (error) {
    throw normalizeJiraError(error);
  }
}

module.exports = {
  addCommentToIssue,
  buildJiraCommentBody,
  testConnection,
};
