const workflowExecutionsService = require("./workflowExecutions.service");
const asyncHandler = require("../../utils/asyncHandler");
const {
  successResponse,
  createdResponse,
  paginatedResponse,
} = require("../../utils/apiResponse");

const list = asyncHandler(async (req, res) => {
  const result = await workflowExecutionsService.listWorkflowExecutions({
    page: req.query.page,
    limit: req.query.limit,
    workflowId: req.query.workflowId,
    startedBy: req.query.startedBy,
    status: req.query.status,
    requester: req.user,
  });

  return paginatedResponse(res, {
    message: "Workflow executions retrieved successfully",
    data: result.items,
    pagination: result.pagination,
  });
});

const getById = asyncHandler(async (req, res) => {
  const execution = await workflowExecutionsService.getWorkflowExecutionById(
    req.params.id,
    req.user
  );

  return successResponse(res, {
    message: "Workflow execution retrieved successfully",
    data: execution,
  });
});

const create = asyncHandler(async (req, res) => {
  const execution = await workflowExecutionsService.createWorkflowExecution({
    workflowId: req.params.workflowId,
    input: req.body.input,
    startedBy: req.user.id,
  });

  return createdResponse(res, {
    message: "Workflow execution created successfully",
    data: execution,
  });
});

module.exports = {
  list,
  getById,
  create,
};
