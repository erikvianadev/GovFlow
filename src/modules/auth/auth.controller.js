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

module.exports = {
  login,
};
