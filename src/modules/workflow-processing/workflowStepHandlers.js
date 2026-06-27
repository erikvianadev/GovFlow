const jiraService = require("../jira/jira.service");
const { JiraBusinessError } = require("../jira/jira.errors");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");
const {
  validateJiraCommentConfiguration,
  validateJiraTransitionConfiguration,
} = require("../../validators/workflowSteps.validator");

async function handleWorkflowStep(step) {
  return handleWorkflowStepWithContext({ step });
}

async function handleWorkflowStepWithContext({ step, execution = null }) {
  if (shouldSimulateFailure(step)) {
    throw new Error(getFailureMessage(step));
  }

  switch (step.action_type) {
    case "MANUAL":
      return handleManualStep(step);

    case "NOTIFICATION":
      return handleNotificationStep(step);

    case "JIRA_TRANSITION":
      return handleJiraTransitionStep({ step, execution });

    case "JIRA_COMMENT":
      return handleJiraCommentStep({ step, execution });

    default:
      throw new Error(`Unsupported action type: ${step.action_type}`);
  }
}

function shouldSimulateFailure(step) {
  return step.configuration && step.configuration.shouldFail === true;
}

function getFailureMessage(step) {
  return (
    step.configuration?.failureMessage ||
    `Simulated failure for action type ${step.action_type}`
  );
}

async function handleManualStep(step) {
  return {
    status: "COMPLETED",
    output: {
      simulated: true,
      actionType: step.action_type,
      message: "Manual step completed by processor simulation",
    },
  };
}

async function handleNotificationStep(step) {
  return {
    status: "COMPLETED",
    output: {
      simulated: true,
      actionType: step.action_type,
      message: "Notification step completed by processor simulation",
    },
  };
}

function buildGovFlowJiraComment({ comment, executionId, executionStepId }) {
  return [
    comment.trim(),
    "",
    jiraService.buildExecutionStepMarker(executionStepId),
    "GovFlow executionId: " + executionId,
  ].join("\n");
}

function buildJiraTransitionAuditMetadata({ step, execution }) {
  return {
    executionId: execution?.id || step.execution_id || null,
    executionStepId: step.id,
    workflowStepId: step.step_id,
    issueKey: step.configuration?.issueKey || null,
    transitionId: step.configuration?.transitionId || null,
    actionType: step.action_type,
  };
}

function buildJiraCommentAuditMetadata({ step, execution }) {
  return {
    executionId: execution?.id || step.execution_id || null,
    executionStepId: step.id,
    workflowStepId: step.step_id,
    issueKey: step.configuration?.issueKey || null,
    actionType: step.action_type,
  };
}

async function handleJiraTransitionStep({ step, execution }) {
  const auditMetadata = buildJiraTransitionAuditMetadata({ step, execution });

  await safeRegisterAuditLog({
    action: "JIRA_TRANSITION_ATTEMPTED",
    entity: "workflow_execution_step",
    entityId: step.id,
    actorId: execution?.started_by || null,
    metadata: auditMetadata,
  });

  try {
    const validationErrors = validateJiraTransitionConfiguration(
      step.configuration
    );

    if (validationErrors.length > 0) {
      throw new JiraBusinessError("Invalid JIRA_TRANSITION configuration", 400);
    }

    const issueKey = step.configuration.issueKey.trim();
    const transitionId = step.configuration.transitionId.trim();
    const result = await jiraService.transitionIssue({
      issueKey,
      transitionId,
    });

    await safeRegisterAuditLog({
      action: "JIRA_TRANSITION_COMPLETED",
      entity: "workflow_execution_step",
      entityId: step.id,
      actorId: execution?.started_by || null,
      metadata: {
        ...auditMetadata,
        issueKey,
        transitionId,
      },
    });

    return {
      status: "COMPLETED",
      output: {
        provider: "jira",
        operation: "transition",
        issueKey,
        transitionId,
        status: result.status,
      },
    };
  } catch (error) {
    await safeRegisterAuditLog({
      action: "JIRA_TRANSITION_FAILED",
      entity: "workflow_execution_step",
      entityId: step.id,
      actorId: execution?.started_by || null,
      metadata: auditMetadata,
    });

    throw error;
  }
}

async function handleJiraCommentStep({ step, execution }) {
  const auditMetadata = buildJiraCommentAuditMetadata({ step, execution });

  await safeRegisterAuditLog({
    action: "JIRA_COMMENT_ATTEMPTED",
    entity: "workflow_execution_step",
    entityId: step.id,
    actorId: execution?.started_by || null,
    metadata: auditMetadata,
  });

  try {
    const validationErrors = validateJiraCommentConfiguration(step.configuration);

    if (validationErrors.length > 0) {
      throw new JiraBusinessError("Invalid JIRA_COMMENT configuration", 400);
    }

    const { issueKey, comment } = step.configuration;
    const commentText = buildGovFlowJiraComment({
      comment,
      executionId: auditMetadata.executionId,
      executionStepId: step.id,
    });
    const result = await jiraService.addCommentToIssue({
      issueKey: issueKey.trim(),
      comment: commentText,
    });

    await safeRegisterAuditLog({
      action: "JIRA_COMMENT_COMPLETED",
      entity: "workflow_execution_step",
      entityId: step.id,
      actorId: execution?.started_by || null,
      metadata: auditMetadata,
    });

    return {
      status: "COMPLETED",
      output: {
        provider: "jira",
        operation: "comment",
        issueKey: issueKey.trim(),
        commentId: result.commentId,
        status: "completed",
      },
    };
  } catch (error) {
    await safeRegisterAuditLog({
      action: "JIRA_COMMENT_FAILED",
      entity: "workflow_execution_step",
      entityId: step.id,
      actorId: execution?.started_by || null,
      metadata: auditMetadata,
    });

    throw error;
  }
}

module.exports = {
  buildGovFlowJiraComment,
  handleWorkflowStep,
  handleWorkflowStepWithContext,
};
