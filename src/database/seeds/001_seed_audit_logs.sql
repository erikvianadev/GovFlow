INSERT INTO audit_logs (action, entity, entity_id, metadata)
SELECT
  'SYSTEM_STARTED',
  'system',
  'govflow-api',
  '{"source": "seed"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM audit_logs
  WHERE action = 'SYSTEM_STARTED'
    AND entity = 'system'
    AND entity_id = 'govflow-api'
);

INSERT INTO audit_logs (action, entity, entity_id, metadata)
SELECT
  'DATABASE_CONNECTED',
  'database',
  'postgres',
  '{"source": "seed"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM audit_logs
  WHERE action = 'DATABASE_CONNECTED'
    AND entity = 'database'
    AND entity_id = 'postgres'
);