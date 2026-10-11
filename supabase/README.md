# Supabase: Loan Charges schemes

The Loan Charges tool reads its fee schemes from two tables.

| Table | One row per |
|---|---|
| `loan_schemes` | loan product: `code` (e.g. `1602`), `name`, `sort_order`, `active` |
| `loan_scheme_fields` | line on the charges sheet, linked by `scheme_id` |

## Applying the migration

1. Supabase Dashboard → **SQL Editor** → paste `migrations/20261011_loan_schemes_v2.sql` → **Run**.
2. Check: `select count(*) from loan_schemes;` → 15, `select count(*) from loan_scheme_fields;` → 234.
3. Open Loan Charges. Scheme names now start with the code, e.g. `(1602) OLD VEHICLE LOAN`.
   Until step 1 is done, the app keeps using the old `loan_products` / `loan_fields` tables.
4. When the new version is live and checked, the old tables can be dropped:
   `drop table loan_fields; drop table loan_products;`

## Fields

| Column | Meaning |
|---|---|
| `key` | Name used in formulas: lowercase letters, digits, `_` (e.g. `amount`, `gst_lpc`). Unique per scheme. |
| `label` | Text shown on screen and on the printout. |
| `kind` | `input` (typed by staff), `select` (dropdown), `output` (calculated). |
| `formula` | For `output` only, e.g. `IF(history=0, amount*1.5%, amount*1%)`. |
| `default_value` | Starting value of an `input` (e.g. ADHESIVE 500). |
| `options` | For `select` only: `[{"label":"1st","value":0},{"label":"2nd","value":1}]`. |
| `in_total` | Adds this line to **TOTAL DEDUCTIONS**. |
| `sort_order` | Display order. Numbered in steps of 10, so a line can be inserted at 25 without renumbering. |

Formulas refer to other lines **by key**, never by position, so reordering or inserting lines is safe.

**Formula rules:**
- Numbers and `+ - * / ^`, `%` (`amount*0.5%` = `amount*0.5/100`).
- Comparisons `= <> < <= > >=`.
- Functions: `SUM IF AND OR NOT MIN MAX ROUND ROUNDUP ROUNDDOWN MROUND INT ABS PMT`.

A formula that uses an unknown key or function shows `ERR` in red on that line, and hovering over it shows the reason. Nothing else on the sheet breaks.

## Access

Row Level Security allows the public (anon) key to **read active schemes only**. There are no write policies, so edits are possible only from the dashboard. The planned admin page will need its own login and write policies.
