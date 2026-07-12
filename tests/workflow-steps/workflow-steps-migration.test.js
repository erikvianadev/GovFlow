const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPath = path.join(
  __dirname,
  "../../src/database/migrations/005_create_workflow_steps.sql"
);

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

test("005_create_workflow_steps.sql defines the workflow steps table contract", () => {
  assert.ok(fs.existsSync(migrationPath));

  const sql = fs.readFileSync(migrationPath, "utf8");
  const normalizedSql = normalizeSql(sql);

  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS "pgcrypto";/);
  assert.match(
    normalizedSql,
    /create table if not exists workflow_steps \(.*id uuid primary key default gen_random_uuid\(\).*workflow_id uuid not null references workflows\(id\) on delete cascade.*name varchar\(150\) not null.*description text.*step_order integer not null check \(step_order > 0\).*action_type varchar\(50\) not null check \( action_type in \( 'manual', 'jira_transition', 'jira_comment', 'notification' \) \).*configuration jsonb.*is_active boolean not null default true.*created_at timestamp with time zone not null default now\(\).*updated_at timestamp with time zone not null default now\(\).*unique \(workflow_id, step_order\).*?\);/
  );

  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_steps_workflow_id on workflow_steps \(workflow_id\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_steps_action_type on workflow_steps \(action_type\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_steps_is_active on workflow_steps \(is_active\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflow_steps_workflow_order on workflow_steps \(workflow_id, step_order\);/
  );
});
