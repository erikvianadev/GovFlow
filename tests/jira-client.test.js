const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const clientPath = path.join(__dirname, "../src/modules/jira/jira.client.js");
const envPath = path.join(__dirname, "../src/config/env.js");
const axiosPath = require.resolve("axios");

function mockModule(modulePath, exports) {
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function loadJiraClient({ env = {}, axiosGet } = {}) {
  [clientPath, envPath, axiosPath].forEach((modulePath) => {
    delete require.cache[modulePath];
  });

  mockModule(envPath, {
    jira: {
      baseUrl: "https://govflow.atlassian.net",
      email: "admin@govflow.test",
      apiToken: "jira-token",
      timeoutMs: 5000,
      ...env,
    },
  });
  mockModule(axiosPath, {
    get: axiosGet,
  });

  return require(clientPath);
}

test("getMyself calls Jira myself endpoint with basic auth", async () => {
  const calls = [];
  const jiraClient = loadJiraClient({
    axiosGet: async (...args) => {
      calls.push(args);

      return {
        data: {
          accountId: "account-123",
          displayName: "Admin User",
        },
      };
    },
  });

  const result = await jiraClient.getMyself();

  assert.deepStrictEqual(result, {
    accountId: "account-123",
    displayName: "Admin User",
  });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(
    calls[0][0],
    "https://govflow.atlassian.net/rest/api/3/myself"
  );
  assert.strictEqual(calls[0][1].timeout, 5000);
  assert.deepStrictEqual(calls[0][1].headers, {
    Authorization: `Basic ${Buffer.from("admin@govflow.test:jira-token").toString(
      "base64"
    )}`,
    Accept: "application/json",
  });
});
