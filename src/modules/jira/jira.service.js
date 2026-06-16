const jiraClient = require("./jira.client");
const AppError = require("../../errors/AppError");
const env = require("../../config/env");

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

module.exports = {
  testConnection,
};
