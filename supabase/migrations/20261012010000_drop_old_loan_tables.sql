-- Drop the original Google Sheets import. The app reads loan_schemes / loan_scheme_fields.
-- Full backup (structure + data): supabase/backups/old_loan_tables_backup.sql
drop table if exists public.loan_fields;
drop table if exists public.loan_products;
