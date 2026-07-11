const workflowsService = require("./workflows.service");
const asyncHandler = require("../../utils/asyncHandler");
const {
  successResponse,
  createdResponse,
  paginatedResponse,
} = require("../../utils/apiResponse");

const list = asyncHandler(async (req, res) => {
  const result = await workflowsService.listWorkflows({
    page: req.query.page,
    limit: req.query.limit,
    departmentId: req.query.departmentId,
    createdBy: req.query.createdBy,
    isActive: req.query.isActive,
    requester: req.user,
  });

  return paginatedResponse(res, {
    message: "Workflows retrieved successfully",
    data: result.items,
    pagination: result.pagination,
  });
});

const getById = asyncHandler(async (req, res) => {
  const workflow = await workflowsService.getWorkflowById(
    req.params.id,
    req.user
  );

  return successResponse(res, {
    message: "Workflow retrieved successfully",
    data: workflow,
  });
});

const create = asyncHandler(async (req, res) => {
  const workflow = await workflowsService.createWorkflow({
    name: req.body.name,
    description: req.body.description,
    departmentId: req.body.departmentId,
    createdBy: req.user.id,
    requester: req.user,
  });

  return createdResponse(res, {
    message: "Workflow created successfully",
    data: workflow,
  });
});

module.exports = {
  list,
  getById,
  create,
};
