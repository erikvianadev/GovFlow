const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const handlersPath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowStepHandlers.js"
);
const jiraServicePath = path.join(__dirname, "../src/modules/jira/jira.service.js");
const safeAuditLogPath = path.join(__dirname, "../src/utils/safeAuditLog.js");

const execution = {
  id: "11111111-1111-4111-8111-111111111111",
  started_by: "22222222-2222-4222-8222-222222222222",
};
const jiraCommentStep = {
  id: "execution-step-1",
  execution_id: execution.id,
  step_id: "workflow-step-1",
  action_type: "JIRA_COMMENT",
  configuration: {
    issueKey: "ABC-123",
    comment: "Workflow processed by GovFlow",
  },
};

function mockModule(modulePath, exports) {
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function loadHandlers({ addCommentToIssue } = {}) {
  const calls = {
    jira: [],
    audit: [],
  };

  [handlersPath, jiraServicePath, safeAuditLogPath].forEach(
    (modulePath) => delete require.cache[modulePath]
  );

  mockModule(jiraServicePath, {
    addCommentToIssue:
      addCommentToIssue ||
      (async (payload) => {
        calls.jira.push(payload);

        return {
          commentId: "10001",
          issueKey: payload.issueKey,
          self: "https://govflow.atlassian.net/rest/api/3/issue/ABC-123/comment/10001",
          created: "2026-06-16T10:00:00.000Z",
        };
      }),
  });
  mockModule(safeAuditLogPath, {
    safeRegisterAuditLog: async (payload) => {
      calls.audit.push(payload);
    },
  });

  return {
    handlers: require(handlersPath),
    calls,
  };
}

test("handleWorkflowStep completes simulated non-Jira-comment action types", async () => {
  const { handlers } = loadHandlers();
  const actionTypes = ["MANUAL", "NOTIFICATION", "JIRA_TRANSITION"];

  for (const actionType of actionTypes) {
    const result = await handlers.handleWorkflowStep({
      action_type: actionType,
    });

    assert.strictEqual(result.status, "COMPLETED");
    assert.deepStrictEqual(result.output.simulated, true);
    assert.strictEqual(result.output.actionType, actionType);
  }
});

test("handleWorkflowStep rejects unsupported action types", async () => {
  const { handlers } = loadHandlers();

  await assert.rejects(
    handlers.handleWorkflowStep({
      action_type: "UNSUPPORTED",
    }),
    /Unsupported action type: UNSUPPORTED/
  );
});

test("handleWorkflowStep supports simulated failures from configuration", async () => {
  const { handlers } = loadHandlers();

  await assert.rejects(
    handlers.handleWorkflowStep({
      action_type: "MANUAL",
      configuration: {
        shouldFail: true,
        failureMessage: "Simulated processor failure",
      },
    }),
    /Simulated processor failure/
  );
});

test("handleWorkflowStep uses a default simulated failure message", async () => {
  const { handlers } = loadHandlers();

  await assert.rejects(
    handlers.handleWorkflowStep({
      action_type: "NOTIFICATION",
      configuration: {
        shouldFail: true,
      },
    }),
    /Simulated failure for action type NOTIFICATION/
  );
});

test("JIRA_COMMENT calls Jira and returns standardized output", async () => {
  const { handlers, calls } = loadHandlers();

  const result = await handlers.handleWorkflowStepWithContext({
    step: jiraCommentStep,
    execution,
  });

  assert.strictEqual(result.status, "COMPLETED");
  assert.deepStrictEqual(result.output, {
    provider: "jira",
    operation: "comment",
    issueKey: "ABC-123",
    commentId: "10001",
    status: "completed",
  });
  assert.strictEqual(calls.jira.length, 1);
  assert.strictEqual(calls.jira[0].issueKey, "ABC-123");
  assert.match(
    calls.jira[0].comment,
    /Workflow processed by GovFlow\n\nGovFlow executionStepId: execution-step-1\nGovFlow executionId: 11111111-1111-4111-8111-111111111111/
  );
  assert.deepStrictEqual(
    calls.audit.map((entry) => entry.action),
    ["JIRA_COMMENT_ATTEMPTED", "JIRA_COMMENT_COMPLETED"]
  );
});

test("JIRA_COMMENT invalid configuration becomes a business failure", async () => {
  const { handlers, calls } = loadHandlers();

  await assert.rejects(
    handlers.handleWorkflowStepWithContext({
      step: {
        ...jiraCommentStep,
        configuration: {
          comment: "missing issue key",
        },
      },
      execution,
    }),
    (error) =>
      error.name === "JiraBusinessError" &&
      error.isBusinessFailure === true &&
      error.message === "Invalid JIRA_COMMENT configuration"
  );
  assert.strictEqual(calls.jira.length, 0);
  assert.deepStrictEqual(
    calls.audit.map((entry) => entry.action),
    ["JIRA_COMMENT_ATTEMPTED", "JIRA_COMMENT_FAILED"]
  );
});

test("JIRA_COMMENT propagates technical Jira errors for retry", async () => {
  const technicalError = new Error("Temporary Jira comment request failure");
  technicalError.isRetryable = true;
  const { handlers } = loadHandlers({
    addCommentToIssue: async () => {
      throw technicalError;
    },
  });

  await assert.rejects(
    handlers.handleWorkflowStepWithContext({
      step: jiraCommentStep,
      execution,
    }),
    (error) =>
      error === technicalError &&
      error.isRetryable === true
  );
});
