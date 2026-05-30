const fs = require("fs");
const path = require("path");

const database = require("../src/config/database");

const migrationsDir = path.join(__dirname, "../src/database/migrations");

async function ensureMigrationsTable() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);
}

async function getExecutedMigrations() {
  const result = await database.query(`
    SELECT filename
    FROM schema_migrations
    ORDER BY filename ASC;
  `);

  return result.rows.map((row) => row.filename);
}

async function runMigration(filename) {
  const migrationPath = path.join(migrationsDir, filename);
  const sql = fs.readFileSync(migrationPath, "utf8");

  console.log(`Running migration: ${filename}`);

  await database.query("BEGIN");

  try {
    await database.query(sql);

    await database.query(
      `
        INSERT INTO schema_migrations (filename)
        VALUES ($1);
      `,
      [filename]
    );

    await database.query("COMMIT");

    console.log(`Migration completed: ${filename}`);
  } catch (error) {
    await database.query("ROLLBACK");
    console.error(`Migration failed: ${filename}`);
    throw error;
  }
}

async function runMigrations() {
  try {
    await ensureMigrationsTable();

    const executedMigrations = await getExecutedMigrations();

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const pendingMigrations = migrationFiles.filter(
      (file) => !executedMigrations.includes(file)
    );

    if (pendingMigrations.length === 0) {
      console.log("No pending migrations.");
      process.exit(0);
    }

    for (const migration of pendingMigrations) {
      await runMigration(migration);
    }

    console.log("All migrations completed.");
    process.exit(0);
  } catch (error) {
    console.error("Error running migrations:", error);
    process.exit(1);
  }
}

runMigrations();