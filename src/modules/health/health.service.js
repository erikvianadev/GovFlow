const db = require("../../config/database"); // import database connection utilities
const { checkRedisConnection } = require("../../config/redis"); // import the function to check Redis connection health
const logger = require("../../config/logger");

async function collectDependencyStatuses() {
  const dbStatus = await getDatabaseStatus(); // verify database connection status
  const redisStatus = await getRedisStatus();

  return {
    overall:
      dbStatus.status === "ok" && redisStatus.status === "ok"
        ? "ok"
        : "degraded",
    dbStatus,
    redisStatus,
  };
}

// Public, side-effect-free status. Exposes only the aggregated status so that
// the public endpoint never leaks infrastructure details nor writes audit logs.
async function getStatus() {
  const { overall } = await collectDependencyStatuses();

  return {
    status: overall,
  };
}

// Detailed status for the ADMIN-only deep endpoint. Still never exposes driver
// error messages, host, port, stack or any internal topology.
async function getDeepStatus() {
  const { overall, dbStatus, redisStatus } = await collectDependencyStatuses();

  return {
    status: overall,
    service: "GovFlow API",
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
  };
}

async function getDatabaseStatus() {
  try {
    await db.checkDatabaseConnection();

    return {
      status: "ok",
    };
  } catch (error) {
    // Log the real cause server-side only; never return it in the HTTP body.
    logger.error({ err: error }, "Health check database failure");

    return {
      status: "error",
    };
  }
}

async function getRedisStatus() {
  try {
    const isConnected = await checkRedisConnection();

    if (!isConnected) {
      throw new Error("Redis connection failed");
    }

    return {
      status: "ok",
    };
  } catch (error) {
    // Log the real cause server-side only; never return it in the HTTP body.
    logger.error({ err: error }, "Health check redis failure");

    return {
      status: "error",
    };
  }
}

module.exports = {
  getStatus,
  getDeepStatus,
};
