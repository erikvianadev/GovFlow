const authService = require("./auth.service");
const asyncHandler = require("../../utils/asyncHandler");
const { successResponse } = require("../../utils/apiResponse");

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    email: req.body?.email,
    password: req.body?.password,
  });

  return successResponse(res, {
    message: "Login successful",
    data: result,
  });
});

const me = asyncHandler(async (req, res) => {
  return successResponse(res, {
    message: "Authenticated user retrieved successfully",
    data: {
      user: req.user,
    },
  });
});

module.exports = {
  login,
  me,
};
