const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPath = path.join(
  __dirname,
  "../../src/database/migrations/004_create_workflows.sql"
);

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

test("004_create_workflows.sql defines the workflows table contract", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const normalizedSql = normalizeSql(sql);

  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS "pgcrypto";/);
  assert.match(
    normalizedSql,
    /create table if not exists workflows \(.*id uuid primary key default gen_random_uuid\(\).*name varchar\(150\) not null.*description text.*department_id uuid references departments\(id\) on delete set null.*created_by uuid references users\(id\) on delete set null.*is_active boolean not null default true.*created_at timestamp with time zone not null default now\(\).*updated_at timestamp with time zone not null default now\(\).*?\);/
  );

  assert.match(
    normalizedSql,
    /create index if not exists idx_workflows_department_id on workflows \(department_id\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflows_created_by on workflows \(created_by\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflows_is_active on workflows \(is_active\);/
  );
  assert.match(
    normalizedSql,
    /create index if not exists idx_workflows_created_at on workflows \(created_at desc\);/
  );
});
