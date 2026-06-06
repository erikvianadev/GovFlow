CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_department_id
ON workflows (department_id);

CREATE INDEX IF NOT EXISTS idx_workflows_created_by
ON workflows (created_by);

CREATE INDEX IF NOT EXISTS idx_workflows_is_active
ON workflows (is_active);

CREATE INDEX IF NOT EXISTS idx_workflows_created_at
ON workflows (created_at DESC);
