const db = require("../../config/database"); // import database connection utilities
const { checkRedisConnection } = require("../../config/redis"); // import the function to check Redis connection health
const auditLogsService = require("../audit-logs/auditLogs.service");

async function getStatus() {
  const dbStatus = await getDatabaseStatus(); // verify database connection status
  const redisStatus = await getRedisStatus();
  await registerHealthCheckAuditLog(dbStatus, redisStatus);

  return {
    status:
      dbStatus.status === "ok" && redisStatus.status === "ok"
        ? "ok"
        : "degraded",
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
    }
  } catch (e) {
    return {
      status: "error",
      error: e.message || "Database connection failed",
    }
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
    return {
      status: "error",
      error: error.message || "Redis connection failed",
    };
  }
}

async function registerHealthCheckAuditLog(dbStatus, redisStatus) {
  try {
    await auditLogsService.register({
      action: "HEALTH_CHECK_EXECUTED",
      entity: "health",
      entityId: "health-endpoint",
      metadata: {
        databaseStatus: dbStatus.status,
        redisStatus: redisStatus.status,
      },
    });
  } catch (error) {
    console.error("Failed to register health check audit log:", error);
  }
}


module.exports = {
  getStatus,
}
