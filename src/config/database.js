const { Pool } = require("pg");

const env = require("./env");

const pool = new Pool({
  host: env.database.host,
  port: env.database.port,
  user: env.database.user,
  password: env.database.password,
  database: env.database.name,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function transaction(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await callback({
      query: (text, params) => client.query(text, params),
    });

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function checkDatabaseConnection() {
  await pool.query("SELECT 1");
}

module.exports = {
  query,
  transaction,
  checkDatabaseConnection,
};

