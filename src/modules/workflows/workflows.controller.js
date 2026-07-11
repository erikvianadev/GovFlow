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

const update = asyncHandler(async (req, res) => {
  const workflow = await workflowsService.updateWorkflow(
    req.params.id,
    { isActive: req.body.is_active },
    req.user
  );

  return successResponse(res, {
    message: "Workflow updated successfully",
    data: workflow,
  });
});

const duplicate = asyncHandler(async (req, res) => {
  // req.body is undefined (not {}) when the request carries no body at all —
  // duplicate is the only workflows endpoint expected to be called with a
  // fully empty body (see manual test #1 of Sub-sprint 6.8.2), so guard here.
  const body = req.body || {};

  const workflow = await workflowsService.duplicateWorkflow(
    req.params.id,
    { name: body.name },
    req.user
  );

  return createdResponse(res, {
    message: "Workflow duplicated successfully",
    data: workflow,
  });
});

module.exports = {
  list,
  getById,
  create,
  update,
  duplicate,
};
