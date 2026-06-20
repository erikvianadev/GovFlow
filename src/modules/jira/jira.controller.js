const jiraService = require("./jira.service");
const asyncHandler = require("../../utils/asyncHandler");
const { successResponse } = require("../../utils/apiResponse");

const testConnection = asyncHandler(async (req, res) => {
  const connection = await jiraService.testConnection();

  return successResponse(res, {
    message: "Jira connection successful",
    data: connection,
  });
});

module.exports = {
  testConnection,
};
