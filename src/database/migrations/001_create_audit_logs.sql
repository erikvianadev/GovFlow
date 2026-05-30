CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100),
  actor_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
ON audit_logs (entity);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON audit_logs (action);