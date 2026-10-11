-- =============================================================================
-- Loan Charges v2 schema: named formula keys instead of sheet cell positions.
-- Generated from the imported loan_products / loan_fields data on 2026-10-11.
--
-- Safe to run while the app is live: it only CREATES new tables (loan_schemes,
-- loan_scheme_fields). The old tables are left untouched; the app reads v2 when
-- it exists and falls back to the old tables otherwise.
--
-- Corrections included (agreed with the branch):
--   (1640) TOP UP LOAN       total no longer includes the loan amount
--   (1633) CAR LOAN          duplicate "SHARES ENTRANCE FEES" row removed
--   (1647) PROPERTY MORTGAGE (SLUM)  new MORTGAGE TYPE dropdown; stamp duty uses it
--   Label spellings: VEHICLE, ENTRANCE, HYPOTHECATION, DEED OF, SURETY, WHEELER
--
-- Run once in Supabase Dashboard -> SQL Editor. Re-running fails on purpose
-- (tables already exist) instead of duplicating data.
-- =============================================================================

begin;

create table public.loan_schemes (
    id          bigint generated always as identity primary key,
    code        text not null unique check (code ~ '^[0-9]+$'),
    name        text not null check (length(trim(name)) > 0),
    sort_order  integer not null default 0,
    active      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table public.loan_scheme_fields (
    id            bigint generated always as identity primary key,
    scheme_id     bigint not null references public.loan_schemes(id) on delete cascade,
    key           text not null,
    label         text not null check (length(trim(label)) > 0),
    kind          text not null check (kind in ('input', 'select', 'output')),
    formula       text,
    default_value numeric,
    options       jsonb,
    in_total      boolean not null default false,
    sort_order    integer not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (scheme_id, key),
    -- keys are used inside formulas: lowercase words, never cell-like (b12) or TRUE/FALSE
    constraint key_format check (key ~ '^[a-z][a-z0-9_]*$' and key !~ '^[a-z]+[0-9]+$' and key not in ('true', 'false')),
    constraint output_has_formula check (kind <> 'output' or coalesce(trim(formula), '') <> ''),
    constraint select_has_options check (kind <> 'select' or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) > 0))
);

create index loan_scheme_fields_scheme_idx on public.loan_scheme_fields (scheme_id, sort_order);

-- updated_at: any change to a scheme or one of its fields bumps the scheme, so the app
-- can tell when its offline copy is out of date.
create or replace function public.loan_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
    new.updated_at := now();
    return new;
end $$;

create or replace function public.loan_touch_scheme() returns trigger
language plpgsql set search_path = public as $$
begin
    update public.loan_schemes set updated_at = now()
     where id = coalesce(new.scheme_id, old.scheme_id);
    return null;
end $$;

create trigger loan_schemes_touch before update on public.loan_schemes
    for each row execute function public.loan_touch_updated_at();
create trigger loan_scheme_fields_touch before update on public.loan_scheme_fields
    for each row execute function public.loan_touch_updated_at();
create trigger loan_scheme_fields_touch_scheme after insert or update or delete on public.loan_scheme_fields
    for each row execute function public.loan_touch_scheme();

-- Row Level Security: the public (anon) key can only READ active schemes.
-- There are deliberately no insert/update/delete policies: edits happen in the
-- dashboard (or later through an admin page with its own login + policies).
alter table public.loan_schemes       enable row level security;
alter table public.loan_scheme_fields enable row level security;

create policy "read active schemes" on public.loan_schemes
    for select to anon, authenticated using (active);
create policy "read fields of active schemes" on public.loan_scheme_fields
    for select to anon, authenticated
    using (exists (select 1 from public.loan_schemes s where s.id = scheme_id and s.active));

grant select on public.loan_schemes, public.loan_scheme_fields to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Data
-- ---------------------------------------------------------------------------
insert into public.loan_schemes (code, name, sort_order, active) values
    ('1602', 'OLD VEHICLE LOAN', 10, true),
    ('1603', 'VEHICLE LOAN', 20, true),
    ('1606', 'HOUSING LOAN', 30, true),
    ('1607', 'GOLD LOAN', 40, true),
    ('1621', 'PERSONAL LOAN', 50, true),
    ('1627', 'PROPERTY MORTGAGE LOAN', 60, true),
    ('1632', 'EDUCATION LOAN', 70, true),
    ('1633', 'CAR LOAN', 80, true),
    ('1634', 'SECURED PERSONAL LOAN', 90, true),
    ('1636', 'DAILY PERSONAL LOAN', 100, true),
    ('1637', 'BUSINESS LOAN', 110, true),
    ('1639', 'INSTANT LOAN', 120, true),
    ('1640', 'TOP UP LOAN', 130, true),
    ('1641', 'TRAVELLING LOAN', 140, true),
    ('1647', 'PROPERTY MORTGAGE (SLUM)', 150, true);

-- (1602) OLD VEHICLE LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('history', 'LOAN HISTORY', 'select', null, null::numeric, '[{"label":"1st","value":0},{"label":"2nd","value":1}]'::jsonb, false, 10),
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 20),
    ('loan_form', 'LOAN FORM', 'output', '200', null::numeric, null::jsonb, true, 30),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 40),
    ('lpc', 'LPC (1ST =1.5% , 2ND =1%) EXCLUDE IF ELECTRIC VEHICLE', 'output', 'IF(history=0,amount*1.5/100,IF(history=1,amount*1/100))', null::numeric, null::jsonb, true, 50),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 60),
    ('shares', 'SHARES 1%', 'output', 'amount*1/100', null::numeric, null::jsonb, true, 70),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 80),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 90),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 100),
    ('loan_agreement', 'LOAN AGREEMENT', 'output', 'IF(amount<=500000, amount*0.10/100, ROUND(amount*0.20/100, -2))', null::numeric, null::jsonb, true, 110),
    ('hypothecation_deed', 'DEED OF HYPOTHECATION', 'output', '100', null::numeric, null::jsonb, true, 120),
    ('power_of_attorney', 'POWER OF ATTORNEY', 'output', '100', null::numeric, null::jsonb, true, 130),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 140),
    ('rto_trade_certificate', 'RTO TRADE CERTIFICATE', 'select', null, null::numeric, '[{"label":"TWO WHEELER 200","value":200},{"label":"THREE WHEELER 250","value":250},{"label":"FOUR WHEELER 300","value":300},{"label":"SIX OR MORE WHEELS 350","value":350}]'::jsonb, true, 150),
    ('gst_trade_certificate', 'GST 18% ON TRADE CERTIFICATE', 'output', 'rto_trade_certificate*18/100', null::numeric, null::jsonb, true, 160),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 170)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1602';

-- (1603) VEHICLE LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('history', 'LOAN HISTORY', 'select', null, null::numeric, '[{"label":"1st","value":0},{"label":"2nd","value":1}]'::jsonb, false, 10),
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 20),
    ('loan_form', 'LOAN FORM', 'output', '200', null::numeric, null::jsonb, true, 30),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 40),
    ('lpc', 'LPC (1ST =1.5% , 2ND =1%) EXCLUDE IF ELECTRIC VEHICLE', 'output', 'IF(amount=0,0,IF(history=0,amount*1.5/100,IF(history=1,amount*1/100)))', null::numeric, null::jsonb, true, 50),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 60),
    ('shares', 'SHARES 1%', 'output', 'amount*1/100', null::numeric, null::jsonb, true, 70),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 80),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 90),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 100),
    ('loan_agreement', 'LOAN AGREEMENT', 'output', 'IF(amount<=500000, amount*0.10/100, ROUND(amount*0.20/100, -2))', null::numeric, null::jsonb, true, 110),
    ('hypothecation_deed', 'DEED OF HYPOTHECATION', 'output', '100', null::numeric, null::jsonb, true, 120),
    ('power_of_attorney', 'POWER OF ATTORNEY', 'output', '100', null::numeric, null::jsonb, true, 130),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 140),
    ('rto_trade_certificate', 'RTO TRADE CERTIFICATE', 'select', null, null::numeric, '[{"label":"TWO WHEELER 200","value":200},{"label":"THREE WHEELER 250","value":250},{"label":"FOUR WHEELER 300","value":300},{"label":"SIX OR MORE WHEELS 350","value":350}]'::jsonb, true, 150),
    ('gst_trade_certificate', 'GST 18% ON TRADE CERTIFICATE', 'output', 'rto_trade_certificate*18/100', null::numeric, null::jsonb, true, 160),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 170)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1603';

-- (1606) HOUSING LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('mortgage_type', 'MORTGAGE TYPE', 'select', null, null::numeric, '[{"label":"REGISTER","value":0},{"label":"EQUITABLE","value":1}]'::jsonb, false, 10),
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 20),
    ('loan_form', 'LOAN FORM', 'output', '250', null::numeric, null::jsonb, true, 30),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 40),
    ('lpc', 'LPC (0.50% MAX 20000)', 'output', 'MIN(amount* 0.50/100, 20000)', null::numeric, null::jsonb, true, 50),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 60),
    ('shares', 'SHARES 1%', 'output', 'amount *1/100', null::numeric, null::jsonb, true, 70),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 80),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 90),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 100),
    ('loan_agreement', 'LOAN AGREEMENT', 'output', '500', null::numeric, null::jsonb, true, 110),
    ('guarantee_deed', 'DEED OF GUARANTEE', 'output', '500', null::numeric, null::jsonb, true, 120),
    ('declaration', 'DECLARATION, UNDERTAKING & INDEMNITY (BORROWER)', 'output', '500', null::numeric, null::jsonb, true, 130),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 140),
    ('registration_fee', 'REGISTRATION FEES (0.50% MAX 15000)', 'output', 'IF(mortgage_type=0, MIN(amount*0.5%, 15000), 0)', null::numeric, null::jsonb, true, 150),
    ('stamp_duty', 'STAMP DUTY (REGISTER: 0.30% , EQUITABLE: UPTO 5 LAKH 0.10% AND ABOVE 5 LAKH 0.30%)', 'output', 'IF(AND(mortgage_type=1, amount<=500000), amount*0.1%, amount*0.3%)', null::numeric, null::jsonb, true, 160),
    ('valuation', 'VALUATION (0.125% MAX 3000 OF VALUATION)', 'input', null, null::numeric, null::jsonb, true, 170),
    ('search_report', 'SEARCH REPORT (CITY 2500/ RURAL 1500 + 400)', 'select', null, null::numeric, '[{"label":"City 2900","value":2900},{"label":"Rural 1900","value":1900}]'::jsonb, true, 180),
    ('legal_fee', 'LEGAL FEES', 'output', 'IF(amount<=1000000, 500, 1000)', null::numeric, null::jsonb, true, 190),
    ('gst_legal_fee', 'GST 18% ON LEGAL FEES', 'output', 'legal_fee*18/100', null::numeric, null::jsonb, true, 200),
    ('advocate_fee', 'ADVOCATE FEES', 'input', null, null::numeric, null::jsonb, true, 210),
    ('power_of_attorney', 'POWER OF ATTORNEY (FRANKING + NOTARY)', 'input', null, null::numeric, null::jsonb, true, 220),
    ('cibil', 'CIBIL CHARGES', 'input', null, null::numeric, null::jsonb, true, 230),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 240)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1606';

-- (1607) GOLD LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 10),
    ('loan_form', 'LOAN FORM', 'output', '100', null::numeric, null::jsonb, true, 20),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 30),
    ('shares', 'SHARES', 'input', null, null::numeric, null::jsonb, true, 40),
    ('adhesive', 'ADHESIVE', 'output', 'IF(amount<=500000, amount*0.10/100, ROUND(amount*0.20/100, -2))', null::numeric, null::jsonb, true, 50),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 60),
    ('valuation', 'VALUATION 0.20% OF VALUATION (MIN 150/- , MAX 2000/-)', 'input', null, null::numeric, null::jsonb, true, 70),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 80)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1607';

-- (1621) PERSONAL LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('history', 'LOAN HISTORY', 'select', null, null::numeric, '[{"label":"1st","value":0},{"label":"2nd","value":1}]'::jsonb, false, 10),
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 20),
    ('loan_form', 'LOAN FORM', 'output', '100', null::numeric, null::jsonb, true, 30),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 40),
    ('lpc', 'LPC (1ST =1.5% , 2ND =1%)', 'output', 'IF(history=0,amount*1.5/100,IF(history=1,amount*1/100))', null::numeric, null::jsonb, true, 50),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 60),
    ('shares', 'SHARES 2.5%', 'output', 'amount*2.5/100', null::numeric, null::jsonb, true, 70),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 80),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 90),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 100),
    ('adhesive', 'ADHESIVE', 'input', null, 500, null::jsonb, true, 110),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 120),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 130)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1621';

-- (1627) PROPERTY MORTGAGE LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('history', 'LOAN HISTORY', 'select', null, null::numeric, '[{"label":"1st","value":0},{"label":"2nd","value":1}]'::jsonb, false, 10),
    ('mortgage_type', 'MORTGAGE TYPE', 'select', null, null::numeric, '[{"label":"REGISTER","value":0},{"label":"EQUITABLE","value":1}]'::jsonb, false, 20),
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 30),
    ('loan_form', 'LOAN FORM', 'output', '250', null::numeric, null::jsonb, true, 40),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 50),
    ('lpc', 'LPC (1ST =1.5% MAX 50000 , 2ND =1% , MAX 40000)', 'output', 'IF(history=0, MIN(50000, amount*1.5/100), IF(history=1, MIN(40000, amount*1/100), 0))', null::numeric, null::jsonb, true, 60),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 70),
    ('shares', 'SHARES (1% MAX 100000)', 'output', 'MIN((amount*1/100), 100000)', null::numeric, null::jsonb, true, 80),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 90),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 100),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 110),
    ('loan_agreement', 'LOAN AGREEMENT', 'output', '500', null::numeric, null::jsonb, true, 120),
    ('guarantee_deed', 'DEED OF GUARANTEE', 'output', '500', null::numeric, null::jsonb, true, 130),
    ('declaration', 'DECLARATION, UNDERTAKING & INDEMNITY (BORROWER)', 'output', '500', null::numeric, null::jsonb, true, 140),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 150),
    ('registration_fee', 'REGISTRATION FEES (0.50% MAX 15000)', 'output', 'IF(mortgage_type=0, MIN(amount*0.5%, 15000), 0)', null::numeric, null::jsonb, true, 160),
    ('stamp_duty', 'STAMP DUTY (REGISTER: 0.30% , EQUITABLE: UPTO 5 LAKH 0.10% AND ABOVE 5 LAKH 0.30%)', 'output', 'IF(AND(mortgage_type=1, amount<=500000), amount*0.1/100, amount*0.3/100)', null::numeric, null::jsonb, true, 170),
    ('valuation', 'VALUATION (0.125% MAX 3000 OF VALUATION)', 'input', null, null::numeric, null::jsonb, true, 180),
    ('search_report', 'SEARCH REPORT (CITY 2500 /RURAL 1500)+ 400', 'select', null, null::numeric, '[{"label":"City 2900","value":2900},{"label":"Rural 1900","value":1900}]'::jsonb, true, 190),
    ('legal_fee', 'LEGAL FEES', 'output', 'IF(amount<=1000000, 500, 1000)', null::numeric, null::jsonb, true, 200),
    ('gst_legal_fee', 'GST 18% ON LEGAL FEES', 'output', 'legal_fee*18/100', null::numeric, null::jsonb, true, 210),
    ('advocate_fee', 'ADVOCATE FEES', 'input', null, null::numeric, null::jsonb, true, 220),
    ('power_of_attorney', 'POWER OF ATTORNEY (FRANKING + NOTARY)', 'input', null, null::numeric, null::jsonb, true, 230),
    ('cibil', 'CIBIL CHARGES', 'input', null, null::numeric, null::jsonb, true, 240),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 250)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1627';

-- (1632) EDUCATION LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 10),
    ('loan_form', 'LOAN FORM', 'output', '150', null::numeric, null::jsonb, true, 20),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 30),
    ('lpc', 'LPC (0.50% MAX 20000)', 'output', 'MIN(amount * 0.50/100, 20000)', null::numeric, null::jsonb, true, 40),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 50),
    ('shares', 'SHARES 1%', 'output', 'amount *1/100', null::numeric, null::jsonb, true, 60),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 70),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 80),
    ('loan_agreement', 'LOAN AGREEMENT', 'output', '100', null::numeric, null::jsonb, true, 90),
    ('guarantee_deed', 'DEED OF GUARANTEE', 'output', '100', null::numeric, null::jsonb, true, 100),
    ('declaration', 'DECLARATION, UNDERTAKING & INDEMNITY (BORROWER)', 'output', '200', null::numeric, null::jsonb, true, 110),
    ('lien_letter', 'LETTER OF LIEN & SET OFF', 'output', '100', null::numeric, null::jsonb, true, 120),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 130),
    ('registration_fee', 'REGISTRATION FEES (REGISTER / EQUITABLE)', 'input', null, null::numeric, null::jsonb, true, 140),
    ('valuation', 'VALUATION (0.125% MAX 3000)', 'output', 'MIN(amount * 0.125/100, 3000)', null::numeric, null::jsonb, true, 150),
    ('search_report', 'SEARCH REPORT (CITY 2500/ RURAL 1500 + 325)', 'select', null, null::numeric, '[{"label":"City 2825","value":2825},{"label":"Rural 1825","value":1825}]'::jsonb, true, 160),
    ('legal_fee', 'LEGAL FEES', 'input', null, null::numeric, null::jsonb, true, 170),
    ('power_of_attorney', 'POWER OF ATTORNEY (FRANKING + NOTARY)', 'input', null, null::numeric, null::jsonb, true, 180),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 190)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1632';

-- (1633) CAR LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('history', 'LOAN HISTORY', 'select', null, null::numeric, '[{"label":"1st","value":0},{"label":"2nd","value":1}]'::jsonb, false, 10),
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 20),
    ('loan_form', 'LOAN FORM', 'output', '200', null::numeric, null::jsonb, true, 30),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 40),
    ('lpc', 'LPC (1ST =1.5% , 2ND =1%) EXCLUDE IF ELECTRIC VEHICLE', 'output', 'IF(history=0,amount*1.5/100,IF(history=1,amount*1/100))', null::numeric, null::jsonb, true, 50),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 60),
    ('shares', 'SHARES 1%', 'output', 'amount*1/100', null::numeric, null::jsonb, true, 70),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 80),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 90),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 100),
    ('loan_agreement', 'LOAN AGREEMENT', 'output', 'IF(amount<=500000, amount*0.10/100, ROUND(amount*0.20/100, -2))', null::numeric, null::jsonb, true, 110),
    ('hypothecation_deed', 'DEED OF HYPOTHECATION', 'output', '100', null::numeric, null::jsonb, true, 120),
    ('power_of_attorney', 'POWER OF ATTORNEY', 'output', '100', null::numeric, null::jsonb, true, 130),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 140),
    ('rto_trade_certificate', 'RTO TRADE CERTIFICATE', 'output', '300', null::numeric, null::jsonb, true, 150),
    ('gst_trade_certificate', 'GST 18% ON TRADE CERTIFICATE', 'output', 'rto_trade_certificate*18/100', null::numeric, null::jsonb, true, 160),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 170)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1633';

-- (1634) SECURED PERSONAL LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 10),
    ('loan_form', 'LOAN FORM', 'output', '100', null::numeric, null::jsonb, true, 20),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 30),
    ('shares', 'SHARES 1%', 'output', 'amount*1/100', null::numeric, null::jsonb, true, 40),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 50),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 60),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 70),
    ('adhesive', 'ADHESIVE', 'output', 'IF(amount<=500000, amount*0.10/100, amount*0.20/100)', null::numeric, null::jsonb, true, 80),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 90),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 100)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1634';

-- (1636) DAILY PERSONAL LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('history', 'LOAN HISTORY', 'select', null, null::numeric, '[{"label":"1st","value":0},{"label":"2nd","value":1}]'::jsonb, false, 10),
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 20),
    ('loan_form', 'LOAN FORM', 'output', '100', null::numeric, null::jsonb, true, 30),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 40),
    ('lpc', 'LPC (1ST =1.5% , 2ND =1%)', 'output', 'IF(history=0,amount*1.5/100,IF(history=1,amount*1/100))', null::numeric, null::jsonb, true, 50),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 60),
    ('shares', 'SHARES 2.5%', 'output', 'amount*2.5/100', null::numeric, null::jsonb, true, 70),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 80),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 90),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 100),
    ('adhesive', 'ADHESIVE', 'input', null, 500, null::jsonb, true, 110),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 120),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 130)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1636';

-- (1637) BUSINESS LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('history', 'LOAN HISTORY', 'select', null, null::numeric, '[{"label":"1st","value":0},{"label":"2nd","value":1}]'::jsonb, false, 10),
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 20),
    ('loan_form', 'LOAN FORM', 'output', '200', null::numeric, null::jsonb, true, 30),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 40),
    ('lpc', 'LPC (1ST =1.5% , 2ND =1%)', 'output', 'IF(history=0,amount*1.5/100,IF(history=1,amount*1/100))', null::numeric, null::jsonb, true, 50),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 60),
    ('shares', 'SHARES 1%', 'output', 'amount*1/100', null::numeric, null::jsonb, true, 70),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 80),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 90),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 100),
    ('hypothecation_movable', 'HYPOTHECATION OF TANGIBLE MOVABLE PROPERTY', 'input', null, 500, null::jsonb, true, 110),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 120),
    ('power_of_attorney', 'POWER OF ATTORNEY (FRANKING + NOTARY)', 'input', null, null::numeric, null::jsonb, true, 130),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 140)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1637';

-- (1639) INSTANT LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 10),
    ('loan_form', 'LOAN FORM', 'output', '100', null::numeric, null::jsonb, true, 20),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 30),
    ('lpc', 'LPC 1.5%', 'output', 'amount*1.5/100', null::numeric, null::jsonb, true, 40),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 50),
    ('shares', 'SHARES 2.5%', 'output', 'amount*2.5/100', null::numeric, null::jsonb, true, 60),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 70),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 80),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 90),
    ('adhesive', 'ADHESIVE', 'output', '500', null::numeric, null::jsonb, true, 100),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 110),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 120)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1639';

-- (1640) TOP UP LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 10),
    ('loan_form', 'LOAN FORM', 'output', '250', null::numeric, null::jsonb, true, 20),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 30),
    ('lpc', 'LPC 1%', 'output', 'amount*1/100', null::numeric, null::jsonb, true, 40),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 50),
    ('loan_agreement', 'LOAN AGREEMENT', 'output', '500', null::numeric, null::jsonb, true, 60),
    ('guarantee_deed', 'DEED OF GUARANTEE', 'output', '500', null::numeric, null::jsonb, true, 70),
    ('declaration', 'DECLARATION, UNDERTAKING & INDEMNITY (BORROWER)', 'output', '500', null::numeric, null::jsonb, true, 80),
    ('continued_mortgage_agreement', 'AGREEMENT FOR CONTINUE MORTGAGE', 'output', '500', null::numeric, null::jsonb, true, 90),
    ('notary', 'NOTARY CHARGES', 'input', null, null::numeric, null::jsonb, true, 100)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1640';

-- (1641) TRAVELLING LOAN
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('history', 'LOAN HISTORY', 'select', null, null::numeric, '[{"label":"1st","value":0},{"label":"2nd","value":1}]'::jsonb, false, 10),
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 20),
    ('loan_form', 'LOAN FORM', 'output', '100', null::numeric, null::jsonb, true, 30),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 40),
    ('lpc', 'LPC (1ST =1% , 2ND =0.50%)', 'output', 'IF(history=0,amount*1/100,IF(history=1,amount*0.50/100))', null::numeric, null::jsonb, true, 50),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 60),
    ('shares', 'SHARES 2.5%', 'output', 'amount*2.5/100', null::numeric, null::jsonb, true, 70),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 80),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 90),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 100),
    ('adhesive', 'ADHESIVE', 'output', '500', null::numeric, null::jsonb, true, 110),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 120),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 130)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1641';

-- (1647) PROPERTY MORTGAGE (SLUM)
insert into public.loan_scheme_fields (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
select s.id, f.key, f.label, f.kind, f.formula, f.default_value, f.options, f.in_total, f.sort_order
from public.loan_schemes s, (values
    ('history', 'LOAN HISTORY', 'select', null, null::numeric, '[{"label":"1st","value":0},{"label":"2nd","value":1}]'::jsonb, false, 10),
    ('mortgage_type', 'MORTGAGE TYPE', 'select', null, null::numeric, '[{"label":"REGISTER","value":0},{"label":"EQUITABLE","value":1}]'::jsonb, false, 20),
    ('amount', 'LOAN AMOUNT', 'input', null, null::numeric, null::jsonb, false, 30),
    ('loan_form', 'LOAN FORM', 'output', '250', null::numeric, null::jsonb, true, 40),
    ('gst_loan_form', 'GST 18% ON LOAN FORM', 'output', 'loan_form*18/100', null::numeric, null::jsonb, true, 50),
    ('lpc', 'LPC (1ST =1.5% MAX 50000 , 2ND =1% , MAX 40000)', 'output', 'IF(history=0, MIN(50000, amount*1.5/100), IF(history=1, MIN(40000, amount*1/100), 0))', null::numeric, null::jsonb, true, 60),
    ('gst_lpc', 'GST 18% ON LPC', 'output', 'lpc*18/100', null::numeric, null::jsonb, true, 70),
    ('shares', 'SHARES 1%', 'output', 'amount *1/100', null::numeric, null::jsonb, true, 80),
    ('share_entrance_fee', 'SHARES ENTRANCE FEES', 'output', '100', null::numeric, null::jsonb, true, 90),
    ('co_loanee_shares', 'CO LOANEE SHARES', 'input', null, null::numeric, null::jsonb, true, 100),
    ('surety_shares', 'SURETY SHARES', 'input', null, null::numeric, null::jsonb, true, 110),
    ('loan_agreement', 'LOAN AGREEMENT', 'output', '500', null::numeric, null::jsonb, true, 120),
    ('guarantee_deed', 'DEED OF GUARANTEE', 'output', '500', null::numeric, null::jsonb, true, 130),
    ('declaration', 'DECLARATION, UNDERTAKING & INDEMNITY (BORROWER)', 'output', '500', null::numeric, null::jsonb, true, 140),
    ('franking', 'FRANKING CHARGES', 'input', null, null::numeric, null::jsonb, true, 150),
    ('stamp_duty', 'STAMP DUTY (REGISTER: 0.30% , EQUITABLE: UPTO 5 LAKH 0.10% AND ABOVE 5 LAKH 0.30%)', 'output', 'IF(AND(mortgage_type=1, amount<=500000), amount*0.1/100, amount*0.3/100)', null::numeric, null::jsonb, true, 160),
    ('valuation', 'VALUATION (0.125% MAX 3000 OF VALUATION)', 'input', null, null::numeric, null::jsonb, true, 170),
    ('search_report', 'SEARCH REPORT (CITY 2500/ RURAL 1500 + 325)', 'select', null, null::numeric, '[{"label":"City 2825","value":2825},{"label":"Rural 1825","value":1825}]'::jsonb, true, 180),
    ('legal_fee', 'LEGAL FEES', 'input', null, null::numeric, null::jsonb, true, 190),
    ('advocate_fee', 'ADVOCATE FEES', 'input', null, null::numeric, null::jsonb, true, 200),
    ('power_of_attorney', 'POWER OF ATTORNEY (FRANKING + NOTARY)', 'input', null, null::numeric, null::jsonb, true, 210),
    ('saving_account', 'SAVING A/C', 'input', null, null::numeric, null::jsonb, true, 220)
) as f(key, label, kind, formula, default_value, options, in_total, sort_order)
where s.code = '1647';

commit;

-- Check after running: expect 15 schemes and 234 fields.
-- select count(*) from public.loan_schemes;  select count(*) from public.loan_scheme_fields;