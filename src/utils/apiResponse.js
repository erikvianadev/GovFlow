function successResponse(
  res,
  {
    message = "Request completed successfully",
    data = null,
    statusCode = 200,
  } = {}
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function createdResponse(
  res,
  { message = "Resource created successfully", data = null } = {}
) {
  return successResponse(res, {
    message,
    data,
    statusCode: 201,
  });
}

function paginatedResponse(
  res,
  {
    message = "Resources retrieved successfully",
    data = [],
    pagination,
    statusCode = 200,
  } = {}
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    pagination,
  });
}

function errorResponse(
  res,
  {
    message = "Internal server error",
    statusCode = 500,
    errors = null,
    details,
  } = {}
) {
  const response = {
    success: false,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  if (details) {
    response.details = details;
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  successResponse,
  createdResponse,
  paginatedResponse,
  errorResponse,
};
