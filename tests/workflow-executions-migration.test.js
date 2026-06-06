const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPath = path.join(
  __dirname,
  "../src/database/migrations/006_create_workflow_executions.sql"
);

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

test("006_create_workflow_executions.sql defines the workflow executions table contract", () => {
  assert.ok(fs.existsSync(migrationPath));

  const sql = fs.readFileSync(migrationPath, "utf8");
  const normalizedSql = normalizeSql(sql);

  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS "pgcrypto";/);
  assert.match(
    normalizedSql,
    /create table if not exists workflow_executions \(.*id uuid primary key default gen_random_uuid\(\).*workflow_id uuid not null references workflows\(id\) on delete cascade.*started_by uuid references users\(id\) on delete set null.*status varchar\(30\) not null default 'pending' check \( status in \( 'pending', 'running', 'completed', 'failed', 'canceled' \) \).*input jsonb.*result jsonb.*started_at timestamp with time zone.*completed_at timestamp with time zone.*created_at timestamp with time zone not null default now\(\).*updated_at timestamp with time zone not null default now\(\).*?\);/
  );

  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_executions_workflow_id on workflow_executions \(workflow_id\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_executions_started_by on workflow_executions \(started_by\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_executions_status on workflow_executions \(status\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_executions_created_at on workflow_executions \(created_at desc\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_executions_workflow_status on workflow_executions \(workflow_id, status\);/
  );
});
