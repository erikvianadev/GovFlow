const env = require("./env");

const bullMQConnection = {
  host: env.redis.host,
  port: env.redis.port,
};

if (env.redis.password) {
  bullMQConnection.password = env.redis.password;
}

module.exports = {
  bullMQConnection,
};
