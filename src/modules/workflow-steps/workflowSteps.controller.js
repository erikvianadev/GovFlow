const workflowStepsService = require("./workflowSteps.service");
const asyncHandler = require("../../utils/asyncHandler");
const {
  successResponse,
  createdResponse,
} = require("../../utils/apiResponse");

const list = asyncHandler(async (req, res) => {
  const result = await workflowStepsService.listWorkflowSteps({
    workflowId: req.params.workflowId,
  });

  return successResponse(res, {
    message: "Workflow steps retrieved successfully",
    data: result.items,
  });
});

const create = asyncHandler(async (req, res) => {
  const step = await workflowStepsService.createWorkflowStep({
    workflowId: req.params.workflowId,
    name: req.body.name,
    description: req.body.description,
    stepOrder: req.body.stepOrder,
    actionType: req.body.actionType,
    configuration: req.body.configuration,
    createdBy: req.user.id,
  });

  return createdResponse(res, {
    message: "Workflow step created successfully",
    data: step,
  });
});

module.exports = {
  list,
  create,
};
