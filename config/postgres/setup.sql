-- S1-DBA-01: run ONCE as a PostgreSQL administrator on a new installation.
-- Existing roles/databases are deliberately not dropped or overwritten.
-- Do not put this file in migrations/: CREATE DATABASE cannot run in a transaction.
-- Set the role's password separately with the psql command: \password hope_app
CREATE ROLE hope_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE hopedb OWNER hope_app;
