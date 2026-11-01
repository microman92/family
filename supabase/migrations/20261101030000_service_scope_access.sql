-- Service-only workers can resolve the helper functions they were granted execute on.
-- Usage on the schema does not grant access to its tables.
grant usage on schema private to service_role;
