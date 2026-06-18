const assert = require("node:assert");
const test = require("node:test");

const {
  JIRA_COMMENT_MAX_LENGTH,
  JIRA_TRANSITION_ID_MAX_LENGTH,
  JIRA_TRANSITION_ISSUE_KEY_MAX_LENGTH,
  validateCreateWorkflowStep,
  validateJiraCommentConfiguration,
  validateJiraTransitionConfiguration,
  validateWorkflowId,
  VALID_ACTION_TYPES,
} = require("../src/validators/workflowSteps.validator");

const validUuid = "11111111-1111-4111-8111-111111111111";

test("validateCreateWorkflowStep accepts a valid workflow step payload", () => {
  const errors = validateCreateWorkflowStep({
    name: "Validar solicitacao",
    description: "Etapa manual de validacao inicial.",
    stepOrder: 1,
    actionType: "MANUAL",
    configuration: {
      instructions: "Review request details",
    },
  });

  assert.deepStrictEqual(errors, []);
});

test("validateCreateWorkflowStep accepts every supported action type", () => {
  for (const actionType of VALID_ACTION_TYPES) {
    const errors = validateCreateWorkflowStep({
      name: "Step",
      stepOrder: 1,
      actionType,
      configuration:
        actionType === "JIRA_COMMENT"
          ? {
              issueKey: "ABC-123",
              comment: "GovFlow async workflow test",
            }
          : actionType === "JIRA_TRANSITION"
          ? {
              issueKey: "ABC-123",
              transitionId: "11",
            }
          : undefined,
    });

    assert.deepStrictEqual(errors, []);
  }
});

test("validateCreateWorkflowStep validates JIRA_TRANSITION configuration", () => {
  assert.deepStrictEqual(
    validateCreateWorkflowStep({
      name: "Transition Jira issue",
      stepOrder: 1,
      actionType: "JIRA_TRANSITION",
      configuration: {
        issueKey: "ABC-123",
        transitionId: "11",
      },
    }),
    []
  );

  assert.deepStrictEqual(
    validateCreateWorkflowStep({
      name: "Transition Jira issue",
      stepOrder: 1,
      actionType: "JIRA_TRANSITION",
      configuration: {
        issueKey: "",
        transitionId: "",
      },
    }),
    [
      {
        field: "configuration.issueKey",
        message: "Jira issue key cannot be empty",
      },
      {
        field: "configuration.transitionId",
        message: "Jira transition ID cannot be empty",
      },
    ]
  );
});

test("validateJiraTransitionConfiguration rejects missing and invalid fields", () => {
  assert.deepStrictEqual(validateJiraTransitionConfiguration(null), [
    {
      field: "configuration",
      message: "JIRA_TRANSITION configuration is required",
    },
  ]);

  assert.deepStrictEqual(
    validateJiraTransitionConfiguration({
      issueKey: "x".repeat(JIRA_TRANSITION_ISSUE_KEY_MAX_LENGTH + 1),
      transitionId: "x".repeat(JIRA_TRANSITION_ID_MAX_LENGTH + 1),
    }),
    [
      {
        field: "configuration.issueKey",
        message: `Jira issue key must be at most ${JIRA_TRANSITION_ISSUE_KEY_MAX_LENGTH} characters`,
      },
      {
        field: "configuration.transitionId",
        message: `Jira transition ID must be at most ${JIRA_TRANSITION_ID_MAX_LENGTH} characters`,
      },
      {
        field: "configuration.transitionId",
        message: "Jira transition ID must be numeric",
      },
    ]
  );

  assert.deepStrictEqual(
    validateJiraTransitionConfiguration({
      issueKey: 123,
      transitionId: 11,
    }),
    [
      {
        field: "configuration.issueKey",
        message: "Jira issue key must be a string",
      },
      {
        field: "configuration.transitionId",
        message: "Jira transition ID must be a string",
      },
    ]
  );
});

test("validateCreateWorkflowStep validates JIRA_COMMENT configuration", () => {
  assert.deepStrictEqual(
    validateCreateWorkflowStep({
      name: "Add Jira comment",
      stepOrder: 1,
      actionType: "JIRA_COMMENT",
      configuration: {
        issueKey: "ABC-123",
        comment: "GovFlow async workflow test",
      },
    }),
    []
  );

  assert.deepStrictEqual(
    validateCreateWorkflowStep({
      name: "Add Jira comment",
      stepOrder: 1,
      actionType: "JIRA_COMMENT",
      configuration: {
        issueKey: "",
        comment: "",
      },
    }),
    [
      {
        field: "configuration.issueKey",
        message: "Jira issue key cannot be empty",
      },
      {
        field: "configuration.comment",
        message: "Jira comment cannot be empty",
      },
    ]
  );
});

test("validateJiraCommentConfiguration rejects missing and oversized fields", () => {
  assert.deepStrictEqual(validateJiraCommentConfiguration(null), [
    {
      field: "configuration",
      message: "JIRA_COMMENT configuration is required",
    },
  ]);

  assert.deepStrictEqual(
    validateJiraCommentConfiguration({
      issueKey: 123,
      comment: "x".repeat(JIRA_COMMENT_MAX_LENGTH + 1),
    }),
    [
      {
        field: "configuration.issueKey",
        message: "Jira issue key must be a string",
      },
      {
        field: "configuration.comment",
        message: `Jira comment must be at most ${JIRA_COMMENT_MAX_LENGTH} characters`,
      },
    ]
  );
});

test("validateCreateWorkflowStep rejects invalid required fields", () => {
  const errors = validateCreateWorkflowStep({
    name: "",
    description: 123,
    stepOrder: 0,
    actionType: "INVALID_ACTION",
    configuration: ["invalid"],
  });

  assert.deepStrictEqual(errors, [
    {
      field: "name",
      message: "Name cannot be empty",
    },
    {
      field: "description",
      message: "Description must be a string",
    },
    {
      field: "stepOrder",
      message: "Step order must be greater than 0",
    },
    {
      field: "actionType",
      message:
        "Action type must be one of: MANUAL, JIRA_TRANSITION, JIRA_COMMENT, NOTIFICATION",
    },
    {
      field: "configuration",
      message: "Configuration must be an object",
    },
  ]);
});

test("validateCreateWorkflowStep rejects non-integer stepOrder", () => {
  const errors = validateCreateWorkflowStep({
    name: "Step",
    stepOrder: "1",
    actionType: "MANUAL",
  });

  assert.deepStrictEqual(errors, [
    {
      field: "stepOrder",
      message: "Step order must be an integer",
    },
  ]);
});

test("validateWorkflowId validates nested route workflowId", () => {
  assert.deepStrictEqual(validateWorkflowId(validUuid), []);
  assert.deepStrictEqual(
    validateWorkflowId("00000000-0000-0000-0000-000000000000"),
    []
  );
  assert.deepStrictEqual(validateWorkflowId("not-a-uuid"), [
    {
      field: "workflowId",
      message: "Workflow ID must be a valid UUID",
    },
  ]);
});
