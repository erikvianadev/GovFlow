const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPath = path.join(
  __dirname,
  "../src/database/migrations/007_create_workflow_execution_steps.sql"
);
const outputMigrationPath = path.join(
  __dirname,
  "../src/database/migrations/008_add_output_to_workflow_execution_steps.sql"
);

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

test("007_create_workflow_execution_steps.sql defines the workflow execution steps table contract", () => {
  assert.ok(fs.existsSync(migrationPath));

  const sql = fs.readFileSync(migrationPath, "utf8");
  const normalizedSql = normalizeSql(sql);

  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS "pgcrypto";/);
  assert.match(
    normalizedSql,
    /create table if not exists workflow_execution_steps \(.*id uuid primary key default gen_random_uuid\(\).*execution_id uuid not null references workflow_executions\(id\) on delete cascade.*step_id uuid not null references workflow_steps\(id\) on delete cascade.*status varchar\(30\) not null default 'pending' check \( status in \( 'pending', 'running', 'completed', 'failed', 'skipped' \) \).*started_at timestamp with time zone.*completed_at timestamp with time zone.*error_message text.*created_at timestamp with time zone not null default now\(\).*updated_at timestamp with time zone not null default now\(\).*unique \(execution_id, step_id\).*?\);/
  );

  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_execution_steps_execution_id on workflow_execution_steps \(execution_id\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_execution_steps_step_id on workflow_execution_steps \(step_id\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_execution_steps_status on workflow_execution_steps \(status\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_execution_steps_execution_status on workflow_execution_steps \(execution_id, status\);/
  );
});

test("008_add_output_to_workflow_execution_steps.sql adds a nullable JSONB output column", () => {
  assert.ok(fs.existsSync(outputMigrationPath));

  const sql = fs.readFileSync(outputMigrationPath, "utf8");
  const normalizedSql = normalizeSql(sql);

  assert.match(
    normalizedSql,
    /alter table workflow_execution_steps add column if not exists output jsonb;/
  );
  // Nullable column: no NOT NULL / no DEFAULT, to stay compatible with rows
  // created before the column existed.
  assert.doesNotMatch(normalizedSql, /output jsonb[^;]*not null/);
  assert.doesNotMatch(normalizedSql, /output jsonb[^;]*default/);
});
