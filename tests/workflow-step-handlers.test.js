const assert = require("node:assert");
const test = require("node:test");

const {
  handleWorkflowStep,
} = require("../src/modules/workflow-processing/workflowStepHandlers");

test("handleWorkflowStep completes supported action types with simulated output", async () => {
  const actionTypes = [
    "MANUAL",
    "NOTIFICATION",
    "JIRA_TRANSITION",
    "JIRA_COMMENT",
  ];

  for (const actionType of actionTypes) {
    const result = await handleWorkflowStep({
      action_type: actionType,
    });

    assert.strictEqual(result.status, "COMPLETED");
    assert.deepStrictEqual(result.output.simulated, true);
    assert.strictEqual(result.output.actionType, actionType);
  }
});

test("handleWorkflowStep rejects unsupported action types", async () => {
  await assert.rejects(
    handleWorkflowStep({
      action_type: "UNSUPPORTED",
    }),
    /Unsupported action type: UNSUPPORTED/
  );
});
