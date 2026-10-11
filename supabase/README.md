# Supabase: Loan Charges schemes

The Loan Charges tool reads its fee schemes from two tables.

| Table | One row per |
|---|---|
| `loan_schemes` | loan product: `code` (e.g. `1602`), `name`, `sort_order`, `active` |
| `loan_scheme_fields` | line on the charges sheet, linked by `scheme_id` |

## History

| Migration | What it did |
|---|---|
| `20261011000000_loan_schemes_v2` | Created the two tables from the Google Sheets import (named keys, corrections, spelling fixes) |
| `20261011230000_harden_loan_permissions` | Public roles can only read; removed API access to `rls_auto_enable()` |
| `20261012000000_loan_schemes_active_only` | Removed the catch-all read policy, so inactive schemes stay hidden |
| `20261012010000_drop_old_loan_tables` | Dropped the original `loan_products` / `loan_fields` import |

The dropped tables are saved in `backups/old_loan_tables_backup.sql` (structure + all rows); running that file in the SQL Editor recreates them.

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

Row Level Security allows the public (anon) key to **read active schemes only**, and the public roles have no write privileges at all. Edits are possible only from the dashboard. The planned admin page will need its own login, grants and write policies.

## Applying changes with the CLI

The project is linked (`npx supabase link --project-ref cuuupfgivmpybetgdrdn`). New SQL goes in
`migrations/<YYYYMMDDHHMMSS>_<name>.sql`, then:

```
npx supabase migration list --linked   # what is applied remotely
npx supabase db push --linked          # apply new migrations
npx supabase db advisors --linked      # security / performance checks
```
