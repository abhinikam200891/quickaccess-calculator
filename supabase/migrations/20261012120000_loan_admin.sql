-- =============================================================================
-- Admin page (admin.html): lets named administrators edit loan charges.
--
-- * Admins sign in with Supabase Auth (email + password) and must also be listed
--   in public.loan_admins. Any other signed-in user is treated like the public.
-- * The ONLY write path is public.admin_save_loan_scheme(): it checks the caller
--   is an admin, refuses to overwrite a scheme someone else changed meanwhile,
--   replaces the scheme and its fields in one transaction, and logs before/after
--   snapshots to public.loan_scheme_audit. anon/authenticated still have no
--   INSERT/UPDATE/DELETE privilege on the loan tables.
-- * Admins can also read inactive schemes (to edit or re-activate them).
--
-- After applying, make someone an admin (SQL Editor):
--   insert into public.loan_admins (user_id, note)
--   select id, 'Head office' from auth.users where email = 'admin@example.com';
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Who is an admin
-- ---------------------------------------------------------------------------
create table public.loan_admins (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    note       text,
    created_at timestamptz not null default now()
);

alter table public.loan_admins enable row level security;
revoke all on public.loan_admins from anon, authenticated;
-- Managed from the dashboard / SQL Editor only; no policies, so the API sees nothing.

create or replace function public.is_loan_admin() returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.loan_admins where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_loan_admin() from public, anon;
grant execute on function public.is_loan_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Read access: public sees active schemes; admins also see inactive ones.
-- One policy per role, so there are no overlapping permissive policies.
-- ---------------------------------------------------------------------------
drop policy if exists "read active schemes" on public.loan_schemes;
drop policy if exists "read fields of active schemes" on public.loan_scheme_fields;

create policy "read active schemes" on public.loan_schemes
    for select to anon using (active);
create policy "read schemes (admins: all)" on public.loan_schemes
    for select to authenticated using (active or (select public.is_loan_admin()));

create policy "read fields of active schemes" on public.loan_scheme_fields
    for select to anon
    using (exists (select 1 from public.loan_schemes s where s.id = scheme_id and s.active));
create policy "read fields (admins: all)" on public.loan_scheme_fields
    for select to authenticated
    using ((select public.is_loan_admin())
           or exists (select 1 from public.loan_schemes s where s.id = scheme_id and s.active));

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.loan_scheme_audit (
    id          bigint generated always as identity primary key,
    scheme_id   bigint,
    scheme_code text,
    action      text not null check (action in ('create', 'update')),
    changed_by  uuid,
    changed_by_email text,
    changed_at  timestamptz not null default now(),
    before      jsonb,
    after       jsonb
);

create index loan_scheme_audit_scheme_idx on public.loan_scheme_audit (scheme_id, changed_at desc);

alter table public.loan_scheme_audit enable row level security;
revoke all on public.loan_scheme_audit from anon, authenticated;
grant select on public.loan_scheme_audit to authenticated;
create policy "admins read audit" on public.loan_scheme_audit
    for select to authenticated using ((select public.is_loan_admin()));

-- Scheme + fields as one JSON document (used for the audit log)
create or replace function public.loan_scheme_snapshot(p_id bigint) returns jsonb
language sql stable set search_path = '' as $$
    select jsonb_build_object(
        'scheme_code', s.scheme_code, 'name', s.name, 'sort_order', s.sort_order, 'active', s.active,
        'fields', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'key', f.key, 'label', f.label, 'kind', f.kind, 'formula', f.formula,
                       'default_value', f.default_value, 'options', f.options,
                       'in_total', f.in_total, 'sort_order', f.sort_order)
                   order by f.sort_order, f.id)
              from public.loan_scheme_fields f where f.scheme_id = s.id), '[]'::jsonb))
      from public.loan_schemes s where s.id = p_id;
$$;

revoke execute on function public.loan_scheme_snapshot(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Save a scheme and all its fields atomically.
--   p_scheme: {"id": 12 | null, "scheme_code": "1602", "name": "...", "sort_order": 10, "active": true}
--   p_fields: [{"key","label","kind","formula","default_value","options","in_total"}, ...] in display order
--   p_expected_updated_at: updated_at the editor loaded (null for a new scheme)
-- Returns {"id", "updated_at"}.
-- Table constraints (key format, unique keys, output needs a formula, select needs
-- options, numeric scheme code) are checked by the database on insert.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_loan_scheme(
    p_scheme jsonb,
    p_fields jsonb,
    p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    v_id      bigint := nullif(p_scheme->>'id', '')::bigint;
    v_current timestamptz;
    v_before  jsonb;
    v_action  text;
    v_updated timestamptz;
begin
    if not public.is_loan_admin() then
        raise exception 'Not authorised to edit loan charges' using errcode = '42501';
    end if;
    if jsonb_typeof(p_scheme) is distinct from 'object' then
        raise exception 'Scheme details are missing' using errcode = '22023';
    end if;
    if jsonb_typeof(p_fields) is distinct from 'array' or jsonb_array_length(p_fields) = 0 then
        raise exception 'A scheme needs at least one line' using errcode = '22023';
    end if;
    if jsonb_array_length(p_fields) > 200 then
        raise exception 'Too many lines (max 200)' using errcode = '22023';
    end if;

    if v_id is null then
        v_action := 'create';
        insert into public.loan_schemes (scheme_code, name, sort_order, active)
        values (trim(p_scheme->>'scheme_code'), trim(p_scheme->>'name'),
                coalesce((p_scheme->>'sort_order')::integer, 0),
                coalesce((p_scheme->>'active')::boolean, true))
        returning id into v_id;
    else
        v_action := 'update';
        select updated_at into v_current from public.loan_schemes where id = v_id for update;
        if not found then
            raise exception 'Scheme no longer exists' using errcode = 'P0002';
        end if;
        if p_expected_updated_at is null or v_current <> p_expected_updated_at then
            raise exception 'This scheme was changed by someone else. Reload it and apply your edits again.'
                using errcode = '40001';
        end if;
        v_before := public.loan_scheme_snapshot(v_id);

        update public.loan_schemes
           set scheme_code = trim(p_scheme->>'scheme_code'),
               name        = trim(p_scheme->>'name'),
               sort_order  = coalesce((p_scheme->>'sort_order')::integer, 0),
               active      = coalesce((p_scheme->>'active')::boolean, true)
         where id = v_id;

        delete from public.loan_scheme_fields where scheme_id = v_id;
    end if;

    insert into public.loan_scheme_fields
        (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
    select v_id,
           lower(trim(f->>'key')),
           trim(f->>'label'),
           f->>'kind',
           nullif(trim(f->>'formula'), ''),
           nullif(trim(f->>'default_value'), '')::numeric,
           case when jsonb_typeof(f->'options') = 'array' then f->'options' end,
           coalesce((f->>'in_total')::boolean, false),
           (n * 10)::integer
      from jsonb_array_elements(p_fields) with ordinality as t(f, n);

    select updated_at into v_updated from public.loan_schemes where id = v_id;

    insert into public.loan_scheme_audit (scheme_id, scheme_code, action, changed_by, changed_by_email, before, after)
    values (v_id, trim(p_scheme->>'scheme_code'), v_action, auth.uid(), auth.jwt()->>'email',
            v_before, public.loan_scheme_snapshot(v_id));

    return jsonb_build_object('id', v_id, 'updated_at', v_updated);
end $$;

revoke execute on function public.admin_save_loan_scheme(jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.admin_save_loan_scheme(jsonb, jsonb, timestamptz) to authenticated;

commit;
