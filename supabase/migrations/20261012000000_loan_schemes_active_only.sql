-- Remove the catch-all read policy added from the dashboard. It made inactive
-- schemes readable and duplicated "read active schemes" (advisor warning
-- multiple_permissive_policies). "read active schemes" stays the only read policy.
drop policy if exists "Enable read access for all users" on public.loan_schemes;
