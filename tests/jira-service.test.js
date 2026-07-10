const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(__dirname, "../src/modules/jira/jira.service.js");
const clientPath = path.join(__dirname, "../src/modules/jira/jira.client.js");
const envPath = path.join(__dirname, "../src/config/env.js");
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

function loadService({ env = {}, post, get } = {}) {
  const calls = {
    post: [],
    get: [],
  };

  [servicePath, clientPath, envPath, loggerPath].forEach(
    (modulePath) => delete require.cache[modulePath]
  );

  mockModule(loggerPath, {
    debug: () => {},
    info: () => {},
    error: () => {},
  });
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
    get:
      get ||
      (async (...args) => {
        calls.get.push(args);

        return { comments: [], startAt: 0, maxResults: 50, total: 0 };
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

test("transitionIssue maps 400, 401, 403, and 404 to business failures with status-specific messages", async () => {
  const expectedMessageByStatus = {
    400: "Jira rejected the transition request as a bad request (status 400): check the request payload",
    401: "Jira rejected the transition request: invalid or expired Jira credentials (status 401)",
    403: "Jira rejected the transition request: credentials are valid but lack permission for this project/resource (status 403)",
    404: "Jira rejected the transition request: resource not found (status 404)",
  };

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
        error.message === expectedMessageByStatus[status]
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

function buildCommentFixture({ id, text, created }) {
  return {
    id,
    created,
    body: {
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}

test("buildExecutionStepMarker matches the marker workflowStepHandlers embeds in JIRA_COMMENT bodies", () => {
  const { service } = loadService();
  assert.strictEqual(
    service.buildExecutionStepMarker("execution-step-1"),
    "GovFlow executionStepId: execution-step-1"
  );
});

test("findCommentByExecutionStepMarker finds a comment carrying the marker", async () => {
  const { service, calls } = loadService({
    get: async (...args) => {
      calls.get.push(args);
      return {
        startAt: 0,
        maxResults: 50,
        total: 2,
        comments: [
          buildCommentFixture({
            id: "10235",
            text: "Workflow processed by GovFlow\n\nGovFlow executionStepId: execution-step-1\nGovFlow executionId: exec-1",
            created: "2026-06-16T10:00:00.000Z",
          }),
          buildCommentFixture({ id: "9001", text: "An unrelated comment", created: "2026-06-15T10:00:00.000Z" }),
        ],
      };
    },
  });

  const result = await service.findCommentByExecutionStepMarker({
    issueKey: "ABC-123",
    executionStepId: "execution-step-1",
  });

  assert.deepStrictEqual(result, { commentId: "10235", issueKey: "ABC-123", created: "2026-06-16T10:00:00.000Z" });
  assert.strictEqual(calls.get[0][0], "/rest/api/3/issue/ABC-123/comment");
  assert.deepStrictEqual(calls.get[0][1], { params: { orderBy: "-created", maxResults: 50, startAt: 0 } });
});

test("findCommentByExecutionStepMarker returns null when no comment matches", async () => {
  const { service } = loadService({
    get: async () => ({
      startAt: 0, maxResults: 50, total: 1,
      comments: [buildCommentFixture({ id: "9001", text: "An unrelated comment", created: "2026-06-15T10:00:00.000Z" })],
    }),
  });

  assert.strictEqual(
    await service.findCommentByExecutionStepMarker({ issueKey: "ABC-123", executionStepId: "execution-step-1" }),
    null
  );
});

test("findCommentByExecutionStepMarker paginates up to the page cap, most-recent first", async () => {
  const { service, calls } = loadService({
    get: async (...args) => {
      calls.get.push(args);
      return {
        startAt: args[1].params.startAt, maxResults: 50, total: 500,
        comments: Array.from({ length: 50 }, (_, i) => buildCommentFixture({
          id: `id-${args[1].params.startAt + i}`, text: "no marker here", created: "2026-06-16T10:00:00.000Z",
        })),
      };
    },
  });

  const result = await service.findCommentByExecutionStepMarker({ issueKey: "ABC-123", executionStepId: "execution-step-1" });

  assert.strictEqual(result, null);
  assert.strictEqual(calls.get.length, 3);
  assert.deepStrictEqual(calls.get.map((args) => args[1].params.startAt), [0, 50, 100]);
});

test("findCommentByExecutionStepMarker never throws: disabled, unconfigured, and Jira errors all resolve to null", async () => {
  const { service: disabledService } = loadService({ env: { enabled: false } });
  assert.strictEqual(
    await disabledService.findCommentByExecutionStepMarker({ issueKey: "ABC-123", executionStepId: "execution-step-1" }),
    null
  );

  const { service: erroringService } = loadService({ get: async () => { throw new Error("Jira unreachable"); } });
  assert.strictEqual(
    await erroringService.findCommentByExecutionStepMarker({ issueKey: "ABC-123", executionStepId: "execution-step-1" }),
    null
  );

  const { service } = loadService();
  assert.strictEqual(
    await service.findCommentByExecutionStepMarker({ issueKey: null, executionStepId: "execution-step-1" }),
    null
  );
});
