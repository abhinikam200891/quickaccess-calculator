-- =============================================================================
-- admin.html: make saving work with the live table layout.
--
-- In the live database loan_scheme_fields links each line to its scheme by
-- scheme_code (foreign key to loan_schemes.scheme_code), not by scheme_id.
-- 20261012120000_loan_admin.sql was written for scheme_id, so its save function,
-- its audit snapshot and its read rules for lines no longer work. This replaces
-- them with scheme_code versions. Nothing else changes: same function names and
-- arguments (admin.html needs no change), same admin check, same conflict check,
-- same audit log.
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query -> paste this whole
--   file -> click in the editor so nothing is highlighted -> Run.
--   The last line of the file is: -- END OF FILE
-- Safe to run again.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Read rules for lines: public sees lines of active schemes; admins see all.
-- ---------------------------------------------------------------------------
drop policy if exists "read fields of active schemes" on public.loan_scheme_fields;
drop policy if exists "read fields (admins: all)" on public.loan_scheme_fields;

create policy "read fields of active schemes" on public.loan_scheme_fields
    for select to anon
    using (exists (select 1 from public.loan_schemes s where s.scheme_code = loan_scheme_fields.scheme_code and s.active));
create policy "read fields (admins: all)" on public.loan_scheme_fields
    for select to authenticated
    using ((select public.is_loan_admin())
           or exists (select 1 from public.loan_schemes s where s.scheme_code = loan_scheme_fields.scheme_code and s.active));

-- ---------------------------------------------------------------------------
-- Scheme + lines as one JSON document (used for the audit log)
-- ---------------------------------------------------------------------------
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
              from public.loan_scheme_fields f where f.scheme_code = s.scheme_code), '[]'::jsonb))
      from public.loan_schemes s where s.id = p_id;
$$;

revoke execute on function public.loan_scheme_snapshot(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Save a scheme and all its lines atomically (called by admin.html).
--   p_scheme: {"id": 12 | null, "scheme_code": "1602", "name": "...", "sort_order": 10, "active": true}
--   p_fields: [{"key","label","kind","formula","default_value","options","in_total"}, ...] in display order
--   p_expected_updated_at: updated_at the editor loaded (null for a new scheme)
-- Returns {"id", "updated_at"}.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_loan_scheme(
    p_scheme jsonb,
    p_fields jsonb,
    p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    v_id      bigint := nullif(p_scheme->>'id', '')::bigint;
    v_code    text   := trim(p_scheme->>'scheme_code');
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
        values (v_code, trim(p_scheme->>'name'),
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

        -- a changed code is carried to the lines by the foreign key (on update cascade)
        update public.loan_schemes
           set scheme_code = v_code,
               name        = trim(p_scheme->>'name'),
               sort_order  = coalesce((p_scheme->>'sort_order')::integer, 0),
               active      = coalesce((p_scheme->>'active')::boolean, true)
         where id = v_id;

        delete from public.loan_scheme_fields where scheme_code = v_code;
    end if;

    insert into public.loan_scheme_fields
        (scheme_code, key, label, kind, formula, default_value, options, in_total, sort_order)
    select v_code,
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
    values (v_id, v_code, v_action, auth.uid(), auth.jwt()->>'email',
            v_before, public.loan_scheme_snapshot(v_id));

    return jsonb_build_object('id', v_id, 'updated_at', v_updated);
end $$;

revoke execute on function public.admin_save_loan_scheme(jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.admin_save_loan_scheme(jsonb, jsonb, timestamptz) to authenticated;

commit;

-- Shows the read rules now on the loan tables (for checking)
select tablename, policyname, roles, cmd
  from pg_policies
 where schemaname = 'public' and tablename like 'loan%'
 order by tablename, policyname;

-- END OF FILE
