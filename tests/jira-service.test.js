const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(__dirname, "../src/modules/jira/jira.service.js");
const clientPath = path.join(__dirname, "../src/modules/jira/jira.client.js");
const envPath = path.join(__dirname, "../src/config/env.js");

function mockModule(modulePath, exports) {
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function loadService({ env = {}, post } = {}) {
  const calls = {
    post: [],
  };

  [servicePath, clientPath, envPath].forEach(
    (modulePath) => delete require.cache[modulePath]
  );

  mockModule(envPath, {
    jira: {
      enabled: true,
      baseUrl: "https://govflow.atlassian.net",
      email: "admin@govflow.test",
      apiToken: "jira-token",
      timeoutMs: 5000,
      ...env,
    },
  });
  mockModule(clientPath, {
    getMyself: async () => ({}),
    post:
      post ||
      (async (...args) => {
        calls.post.push(args);

        return {
          id: "10001",
          self: "https://govflow.atlassian.net/rest/api/3/issue/ABC-123/comment/10001",
          created: "2026-06-16T10:00:00.000Z",
        };
      }),
  });

  return {
    service: require(servicePath),
    calls,
  };
}

test("buildJiraCommentBody returns Jira ADF document", () => {
  const { service } = loadService();

  assert.deepStrictEqual(service.buildJiraCommentBody("Hello Jira"), {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Hello Jira",
          },
        ],
      },
    ],
  });
});

test("addCommentToIssue posts ADF body to Jira comment endpoint", async () => {
  const { service, calls } = loadService();

  const result = await service.addCommentToIssue({
    issueKey: "ABC-123",
    comment: "Workflow processed by GovFlow",
  });

  assert.deepStrictEqual(result, {
    commentId: "10001",
    issueKey: "ABC-123",
    self: "https://govflow.atlassian.net/rest/api/3/issue/ABC-123/comment/10001",
    created: "2026-06-16T10:00:00.000Z",
  });
  assert.strictEqual(calls.post.length, 1);
  assert.strictEqual(calls.post[0][0], "/rest/api/3/issue/ABC-123/comment");
  assert.deepStrictEqual(calls.post[0][1], {
    body: service.buildJiraCommentBody("Workflow processed by GovFlow"),
  });
});

test("transitionIssue posts transition payload to Jira transitions endpoint", async () => {
  const { service, calls } = loadService({
    post: async (...args) => {
      calls.post.push(args);

      return {};
    },
  });

  const result = await service.transitionIssue({
    issueKey: "ABC-123",
    transitionId: "11",
  });

  assert.deepStrictEqual(result, {
    issueKey: "ABC-123",
    transitionId: "11",
    status: "completed",
  });
  assert.strictEqual(calls.post.length, 1);
  assert.strictEqual(calls.post[0][0], "/rest/api/3/issue/ABC-123/transitions");
  assert.deepStrictEqual(calls.post[0][1], {
    transition: {
      id: "11",
    },
  });
});

test("transitionIssue encodes issue keys in Jira transitions endpoint", async () => {
  const { service, calls } = loadService({
    post: async (...args) => {
      calls.post.push(args);

      return {};
    },
  });

  await service.transitionIssue({
    issueKey: "ABC 123",
    transitionId: "11",
  });

  assert.strictEqual(calls.post[0][0], "/rest/api/3/issue/ABC%20123/transitions");
});

test("addCommentToIssue treats disabled Jira as business failure", async () => {
  const { service } = loadService({
    env: {
      enabled: false,
    },
  });

  await assert.rejects(
    service.addCommentToIssue({
      issueKey: "ABC-123",
      comment: "Comment",
    }),
    (error) =>
      error.name === "JiraBusinessError" &&
      error.isBusinessFailure === true &&
      error.message === "Jira integration is disabled"
  );
});

test("addCommentToIssue maps 404 to business failure", async () => {
  const { service } = loadService({
    post: async () => {
      const error = new Error("not found");
      error.response = {
        status: 404,
      };
      throw error;
    },
  });

  await assert.rejects(
    service.addCommentToIssue({
      issueKey: "ABC-404",
      comment: "Comment",
    }),
    (error) =>
      error.name === "JiraBusinessError" &&
      error.statusCode === 404 &&
      error.isBusinessFailure === true
  );
});

test("addCommentToIssue maps 429 and network failures to technical failures", async () => {
  for (const jiraError of [
    Object.assign(new Error("rate limited"), { response: { status: 429 } }),
    Object.assign(new Error("timeout"), { code: "ECONNABORTED" }),
  ]) {
    const { service } = loadService({
      post: async () => {
        throw jiraError;
      },
    });

    await assert.rejects(
      service.addCommentToIssue({
        issueKey: "ABC-123",
        comment: "Comment",
      }),
      (error) =>
        error.name === "JiraTechnicalError" &&
        error.isRetryable === true
    );
  }
});

test("transitionIssue treats disabled Jira as business failure", async () => {
  const { service } = loadService({
    env: {
      enabled: false,
    },
  });

  await assert.rejects(
    service.transitionIssue({
      issueKey: "ABC-123",
      transitionId: "11",
    }),
    (error) =>
      error.name === "JiraBusinessError" &&
      error.isBusinessFailure === true &&
      error.message === "Jira integration is disabled"
  );
});

test("transitionIssue maps 400, 401, 403, and 404 to business failures", async () => {
  for (const status of [400, 401, 403, 404]) {
    const { service } = loadService({
      post: async () => {
        const error = new Error(`jira status ${status}`);
        error.response = {
          status,
        };
        throw error;
      },
    });

    await assert.rejects(
      service.transitionIssue({
        issueKey: "ABC-123",
        transitionId: "11",
      }),
      (error) =>
        error.name === "JiraBusinessError" &&
        error.statusCode === status &&
        error.isBusinessFailure === true &&
        error.message === `Jira rejected transition request with status ${status}`
    );
  }
});

test("transitionIssue maps 429 and network failures to technical failures", async () => {
  for (const jiraError of [
    Object.assign(new Error("rate limited"), { response: { status: 429 } }),
    Object.assign(new Error("timeout"), { code: "ECONNABORTED" }),
  ]) {
    const { service } = loadService({
      post: async () => {
        throw jiraError;
      },
    });

    await assert.rejects(
      service.transitionIssue({
        issueKey: "ABC-123",
        transitionId: "11",
      }),
      (error) =>
        error.name === "JiraTechnicalError" &&
        error.isRetryable === true
    );
  }
});
