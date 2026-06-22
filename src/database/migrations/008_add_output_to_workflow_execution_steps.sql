ALTER TABLE workflow_execution_steps
  ADD COLUMN IF NOT EXISTS output JSONB;
