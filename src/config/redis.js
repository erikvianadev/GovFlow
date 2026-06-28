const { createClient } = require("redis"); // Import the createClient function from the redis package to create a Redis client

const env = require("./env");
const logger = require("./logger");

let redisClient;

function createRedisClient() { // Create a new Redis client using the configuration from the env module
  const client = createClient({
    socket: {
      host: env.redis.host,
      port: env.redis.port,
    },
    password: env.redis.password,
  });

  client.on("error", (error) => { // Log any errors that occur with the Redis client
    logger.error({ err: error }, "Redis client error");
  });

  return client;
}

async function getRedisClient() { // Get the Redis client, creating and connecting it if it doesn't already exist
  if (!redisClient) {
    redisClient = createRedisClient(); // Create the Redis client if it hasn't been created yet
  }

  if (!redisClient.isOpen) { // Connect the Redis client if it's not already connected
    await redisClient.connect();
  }

  return redisClient;
}

async function checkRedisConnection() { // Check if the Redis connection is healthy by sending a PING command and expecting a PONG response
  const client = await getRedisClient();
  const response = await client.ping();

  return response === "PONG";
}

module.exports = {
  getRedisClient,
  checkRedisConnection,
};
