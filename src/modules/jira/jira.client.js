const axios = require("axios");
const env = require("../../config/env");

function createAuthHeader() {
  const token = Buffer.from(`${env.jira.email}:${env.jira.apiToken}`).toString("base64");

  return `Basic ${token}`;
}

async function getMyself() {
  const response = await axios.get(`${env.jira.baseUrl}/rest/api/3/myself`, {
    timeout: env.jira.timeoutMs,
    headers: {
      Authorization: createAuthHeader(),
      Accept: "application/json",
    },
  });

  return response.data;
}

module.exports = {
  getMyself,
};
