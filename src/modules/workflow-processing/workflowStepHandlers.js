async function handleWorkflowStep(step) {
  if (shouldSimulateFailure(step)) {
    throw new Error(getFailureMessage(step));
  }

  switch (step.action_type) {
    case "MANUAL":
      return handleManualStep(step);

    case "NOTIFICATION":
      return handleNotificationStep(step);

    case "JIRA_TRANSITION":
      return handleJiraTransitionStep(step);

    case "JIRA_COMMENT":
      return handleJiraCommentStep(step);

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

async function handleJiraTransitionStep(step) {
  return {
    status: "COMPLETED",
    output: {
      simulated: true,
      actionType: step.action_type,
      message: "Jira transition step completed by simulation",
    },
  };
}

async function handleJiraCommentStep(step) {
  return {
    status: "COMPLETED",
    output: {
      simulated: true,
      actionType: step.action_type,
      message: "Jira comment step completed by simulation",
    },
  };
}

module.exports = {
  handleWorkflowStep,
};
