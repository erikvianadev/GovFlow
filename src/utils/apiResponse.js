function successResponse(res, { message, data } = {}) {
  return res.status(200).json({
    success: true,
    message,
    data,
  });
}

function createdResponse(res, { message, data } = {}) {
  return res.status(201).json({
    success: true,
    message,
    data,
  });
}

function paginatedResponse(res, { message, data, pagination } = {}) {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination,
  });
}

function errorResponse(res, { statusCode = 500, message, details } = {}) {
  const body = {
    success: false,
    message,
  };

  if (details !== undefined) {
    body.details = details;
  }

  return res.status(statusCode).json(body);
}

module.exports = {
  successResponse,
  createdResponse,
  paginatedResponse,
  errorResponse,
};
