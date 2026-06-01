INSERT INTO departments (
  name,
  description
)
VALUES (
  'Tecnologia',
  'Departamento responsável por sistemas, integrações e automações.'
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO users (
  name,
  email,
  password_hash,
  role,
  department_id
)
VALUES (
  'Admin User',
  'admin@govflow.local',
  'temporary_hash_replace_with_bcrypt_later',
  'ADMIN',
  (
    SELECT id
    FROM departments
    WHERE name = 'Tecnologia'
    LIMIT 1
  )
)
ON CONFLICT (email) DO NOTHING;
