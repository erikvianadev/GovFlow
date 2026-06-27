const axios = require("axios");
const env = require("../../config/env");

function createAuthHeader() {
  const token = Buffer.from(`${env.jira.email}:${env.jira.apiToken}`).toString("base64");

  return `Basic ${token}`;
}

function getBaseUrl() {
  return env.jira.baseUrl.replace(/\/+$/, "");
}

async function getMyself() {
  const response = await axios.get(`${getBaseUrl()}/rest/api/3/myself`, {
    timeout: env.jira.timeoutMs,
    headers: {
      Authorization: createAuthHeader(),
      Accept: "application/json",
    },
  });

  return response.data;
}

async function post(path, payload) {
  const response = await axios.post(`${getBaseUrl()}${path}`, payload, {
    timeout: env.jira.timeoutMs,
    headers: {
      Authorization: createAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

async function get(path, { params } = {}) {
  const response = await axios.get(`${getBaseUrl()}${path}`, {
    timeout: env.jira.timeoutMs,
    params,
    headers: {
      Authorization: createAuthHeader(),
      Accept: "application/json",
    },
  });

  return response.data;
}

module.exports = {
  getMyself,
  post,
  get,
};
