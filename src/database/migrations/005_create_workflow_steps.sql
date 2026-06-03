CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  action_type VARCHAR(50) NOT NULL CHECK (
    action_type IN (
      'MANUAL',
      'JIRA_TRANSITION',
      'JIRA_COMMENT',
      'NOTIFICATION'
    )
  ),
  configuration JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id
ON workflow_steps (workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_action_type
ON workflow_steps (action_type);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_is_active
ON workflow_steps (is_active);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_order
ON workflow_steps (workflow_id, step_order);
