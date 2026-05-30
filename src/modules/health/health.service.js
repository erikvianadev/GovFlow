const db = require('../../config/database'); // import database connection utilities

async function getStatus() {

  const dbStatus = await getDatabaseStatus(); // verify database connection statys

  return {
    status: 'ok',
    service: 'GovFlow API',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: dbStatus,
    }
  };
}

async function getDatabaseStatus() { // check-database-connection
  try {
    await db.checkDatabaseConnection(); 
    
    return {
      status: 'ok',
    }
  } catch (e) {
    return {
      status: 'error',
      error: e.message || 'Database connection failed',
    }
  }
}

module.exports = {
  getStatus,
}
