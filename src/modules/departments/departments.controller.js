const departmentsService = require("./departments.service");
const asyncHandler = require("../../utils/asyncHandler");
const {
  successResponse,
  createdResponse,
  paginatedResponse,
} = require("../../utils/apiResponse");

const list = asyncHandler(async (req, res) => {
  const result = await departmentsService.listDepartments({
    page: req.query.page,
    limit: req.query.limit,
    isActive: req.query.isActive,
  });

  return paginatedResponse(res, {
    message: "Departments retrieved successfully",
    data: result.items,
    pagination: result.pagination,
  });
});

const getById = asyncHandler(async (req, res) => {
  const department = await departmentsService.getDepartmentById(req.params.id);

  return successResponse(res, {
    message: "Department retrieved successfully",
    data: department,
  });
});

const create = asyncHandler(async (req, res) => {
  const department = await departmentsService.createDepartment({
    name: req.body.name,
    description: req.body.description,
    createdBy: req.user.id,
  });

  return createdResponse(res, {
    message: "Department created successfully",
    data: department,
  });
});

module.exports = {
  list,
  getById,
  create,
};
