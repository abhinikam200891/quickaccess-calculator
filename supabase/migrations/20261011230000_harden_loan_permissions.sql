-- =============================================================================
-- Tighten table privileges. RLS already blocks writes from the public key, but
-- Supabase grants anon/authenticated every privilege by default, and TRUNCATE is
-- not covered by RLS. Reads keep working exactly as before.
-- The admin page will later GRANT only what it needs, together with its policies.
-- =============================================================================

revoke insert, update, delete, truncate, references, trigger
    on public.loan_schemes, public.loan_scheme_fields,
       public.loan_products, public.loan_fields
    from anon, authenticated;

-- Supabase's auto-enable-RLS event trigger function does not need to be callable
-- through the API (/rest/v1/rpc/rls_auto_enable). Revoking EXECUTE does not stop
-- the event trigger itself from running.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
