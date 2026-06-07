CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS workflow_execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN (
      'PENDING',
      'RUNNING',
      'COMPLETED',
      'FAILED',
      'SKIPPED'
    )
  ),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (execution_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_execution_id
ON workflow_execution_steps (execution_id);

CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_step_id
ON workflow_execution_steps (step_id);

CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_status
ON workflow_execution_steps (status);

CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_execution_status
ON workflow_execution_steps (execution_id, status);
