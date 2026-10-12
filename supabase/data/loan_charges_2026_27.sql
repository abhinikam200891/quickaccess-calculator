-- =============================================================================
-- Loan charges as per Loan Dhoran 2026-27 (section 34: कर्ज प्रकारनिहाय हप्ता,
-- व्याजदर व प्रोसेसिंग चार्जेस व इतर खर्च, page 65).
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
--
-- * Each row below is one scheme: (scheme_code, name, sort_order, lines).
--   CHANGE THE SCHEME CODES (2601...) TO YOUR REAL CODES before running.
--   A code that already exists is UPDATED (its lines are replaced);
--   a new code is ADDED. Schemes not listed here are left untouched.
-- * Every change is written to loan_scheme_audit, like a save from admin.html.
-- * Safe to run again: it just re-applies the same values.
-- * Loans against daily / recurring / lakhpati deposits, FD loans and FD
--   overdraft have no charges, so they are not listed.
-- =============================================================================

begin;

create temp table new_schemes (scheme_code text, name text, sort_order integer, fields jsonb) on commit drop;

insert into new_schemes (scheme_code, name, sort_order, fields) values
    ('2601', 'Daily Deposit Personal Loan (दैनंदिन ठेव वै. कर्ज)', 10, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"150","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 2.5%","kind":"output","formula":"ROUND(AMOUNT*2.5%,0)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2602', 'Personal Loan (वैयक्तिक कर्ज)', 20, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"150","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 2.5%","kind":"output","formula":"ROUND(AMOUNT*2.5%,0)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2603', 'Urgent Loan (तातडीचे कर्ज)', 30, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"150","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 2.5%","kind":"output","formula":"ROUND(AMOUNT*2.5%,0)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2604', 'Tourism Personal Loan (पर्यटन वै. कर्ज)', 40, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"150","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 2.5%","kind":"output","formula":"ROUND(AMOUNT*2.5%,0)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2605', 'Secured Personal Loan (सुरक्षित वै. कर्ज)', 50, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"150","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 0.5%","kind":"output","formula":"ROUND(AMOUNT*0.5%,0)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2606', 'Goods / Professional Loan (मालतारण / प्रोफेशनल कर्ज)', 60, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"200","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2607', 'Property Loan - Clear Title (मालमत्ता तारण क्लिअर टायटल)', 70, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"loan_no","label":"Property Loan (1st / 2nd)","kind":"select","formula":null,"default_value":null,"options":[{"label":"1st - max 50000","value":50000},{"label":"2nd - max 40000","value":40000}],"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"250","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"MIN(ROUND(AMOUNT*1%,0),LOAN_NO)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 1% (max 1,00,000)","kind":"output","formula":"MIN(ROUND(AMOUNT*1%,0),100000)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2608', 'Shop Purchase Loan (शॉप खरेदी कर्ज)', 80, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"loan_no","label":"Property Loan (1st / 2nd)","kind":"select","formula":null,"default_value":null,"options":[{"label":"1st - max 50000","value":50000},{"label":"2nd - max 40000","value":40000}],"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"250","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"MIN(ROUND(AMOUNT*1%,0),LOAN_NO)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 1% (max 1,00,000)","kind":"output","formula":"MIN(ROUND(AMOUNT*1%,0),100000)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2609', 'Property Loan - Slum / Pagdi / Chawl (स्लम / पागडी / चाळ)', 90, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"loan_no","label":"Property Loan (1st / 2nd)","kind":"select","formula":null,"default_value":null,"options":[{"label":"1st - max 50000","value":50000},{"label":"2nd - max 40000","value":40000}],"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"250","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"MIN(ROUND(AMOUNT*1%,0),LOAN_NO)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 1% (max 1,00,000)","kind":"output","formula":"MIN(ROUND(AMOUNT*1%,0),100000)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2610', 'Home Loan - Dnyanvastu (ज्ञानवास्तू गृह कर्ज)', 100, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"250","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 0.5% (max 20,000)","kind":"output","formula":"MIN(ROUND(AMOUNT*0.5%,0),20000)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 1% (max 1,00,000)","kind":"output","formula":"MIN(ROUND(AMOUNT*1%,0),100000)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2611', 'Top Up Loan (टॉप अप कर्ज)', 110, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"250","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2612', 'Vehicle Loan - Car / Commercial / Rickshaw-Taxi / Two Wheeler / Old (वाहनतारण कर्ज)', 120, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"200","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2613', 'Gold Loan (सोनेतारण कर्ज)', 130, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"150","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares","kind":"output","formula":"100","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2614', 'LIC / NSC Loan (एल.आय.सी. / एन.एस.सी. तारण)', 140, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"150","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares","kind":"output","formula":"100","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2615', 'Representative Personal Loan (प्रतिनिधी वै. कर्ज)', 150, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"150","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares","kind":"output","formula":"100","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2616', 'Representative Two Wheeler Loan (प्र. दुचाकी वाहन)', 160, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"250","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares","kind":"output","formula":"100","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2617', 'Representative Home Loan (प्र. गृहतारण कर्ज)', 170, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"250","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares","kind":"output","formula":"100","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2618', 'Representative Property Loan (प्र. मालमत्ता तारण)', 180, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"250","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares","kind":"output","formula":"100","default_value":null,"options":null,"in_total":true}]'::jsonb),
    ('2619', 'Education Loan (शैक्षणिक कर्ज)', 190, '[{"key":"amount","label":"LOAN AMOUNT","kind":"input","formula":null,"default_value":null,"options":null,"in_total":false},{"key":"application_fee","label":"Loan Application Fee","kind":"output","formula":"200","default_value":null,"options":null,"in_total":true},{"key":"processing_fee","label":"Processing Charges 0.5% (max 20,000)","kind":"output","formula":"MIN(ROUND(AMOUNT*0.5%,0),20000)","default_value":null,"options":null,"in_total":true},{"key":"shares","label":"Shares 1%","kind":"output","formula":"ROUND(AMOUNT*1%,0)","default_value":null,"options":null,"in_total":true}]'::jsonb);

do $$
declare
    r      record;
    v_id   bigint;
    v_before jsonb;
begin
    for r in select * from new_schemes order by sort_order loop
        select id into v_id from public.loan_schemes where scheme_code = r.scheme_code for update;

        if v_id is null then
            insert into public.loan_schemes (scheme_code, name, sort_order, active)
            values (r.scheme_code, r.name, r.sort_order, true)
            returning id into v_id;
            v_before := null;
        else
            v_before := public.loan_scheme_snapshot(v_id);
            update public.loan_schemes
               set name = r.name, sort_order = r.sort_order, active = true
             where id = v_id;
            delete from public.loan_scheme_fields where scheme_id = v_id;
        end if;

        insert into public.loan_scheme_fields
            (scheme_id, key, label, kind, formula, default_value, options, in_total, sort_order)
        select v_id, f->>'key', f->>'label', f->>'kind', f->>'formula',
               (f->>'default_value')::numeric,
               case when jsonb_typeof(f->'options') = 'array' then f->'options' end,
               (f->>'in_total')::boolean, (n * 10)::integer
          from jsonb_array_elements(r.fields) with ordinality as t(f, n);

        insert into public.loan_scheme_audit (scheme_id, scheme_code, action, changed_by_email, before, after)
        values (v_id, r.scheme_code, case when v_before is null then 'create' else 'update' end,
                'SQL import: Loan Dhoran 2026-27', v_before, public.loan_scheme_snapshot(v_id));
    end loop;
end $$;

-- Optional: hide old schemes that are not part of the 2026-27 list (remove the -- to use)
-- update public.loan_schemes set active = false
--  where scheme_code not in (select scheme_code from new_schemes);

commit;

-- Check the result:
-- select s.scheme_code, s.name, f.label, f.formula
--   from public.loan_schemes s join public.loan_scheme_fields f on f.scheme_id = s.id
--  order by s.sort_order, f.sort_order;
