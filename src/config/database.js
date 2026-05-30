const { Pool } = require('pg');

const env = require('./env');

const pool = new Pool({
  host: env.database.host,
  port: env.database.port,
  user: env.database.user,
  password: env.database.password,
  database: env.database.name,
});

async function query(text, params) {
  return pool.query(text, params);
};

async function checkDatabaseConnection() {
  await pool.query('SELECT 1');
}

module.exports = {
  query,
  checkDatabaseConnection,
}

