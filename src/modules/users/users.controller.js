const usersService = require("./users.service");
const asyncHandler = require("../../utils/asyncHandler");
const {
  successResponse,
  createdResponse,
  paginatedResponse,
} = require("../../utils/apiResponse");

const list = asyncHandler(async (req, res) => {
  const result = await usersService.listUsers({
    page: req.query.page,
    limit: req.query.limit,
    role: req.query.role,
    departmentId: req.query.departmentId,
    isActive: req.query.isActive,
  });

  return paginatedResponse(res, {
    message: "Users retrieved successfully",
    data: result.items,
    pagination: result.pagination,
  });
});

const getById = asyncHandler(async (req, res) => {
  const user = await usersService.getUserById(req.params.id);

  return successResponse(res, {
    message: "User retrieved successfully",
    data: user,
  });
});

const create = asyncHandler(async (req, res) => {
  const user = await usersService.createUser({
    name: req.body.name,
    email: req.body.email,
    passwordHash: req.body.passwordHash,
    role: req.body.role,
    departmentId: req.body.departmentId,
  });

  return createdResponse(res, {
    message: "User created successfully",
    data: user,
  });
});

module.exports = {
  list,
  getById,
  create,
};
