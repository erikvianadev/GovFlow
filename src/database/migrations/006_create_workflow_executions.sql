CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN (
      'PENDING',
      'RUNNING',
      'COMPLETED',
      'FAILED',
      'CANCELED'
    )
  ),
  input JSONB,
  result JSONB,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id
ON workflow_executions (workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_started_by
ON workflow_executions (started_by);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
ON workflow_executions (status);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at
ON workflow_executions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_status
ON workflow_executions (workflow_id, status);
