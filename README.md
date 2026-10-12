# Quick Access Calculator

Banking calculator workstation for branch staff: one shell (`index.html`) with a sidebar, a Ctrl+K switcher and a daily task list. Each calculator is its own page in `tools/`, opened inside the shell.

## Running

Open `index.html` in a browser. No build step and no server needed (it also works on GitHub Pages / Cloudflare Pages).
Loan Charges needs internet the first time, to load schemes from Supabase; after that it also works offline.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `assets/js/main.js`, `assets/css/main.css` | Shell: sidebar, switcher, dashboard tasks |
| `admin.html`, `assets/js/admin.js` | Loan Charges admin: edit fee schemes (sign-in required) |
| `assets/js/pages-manifest.js` | **List of tools in the sidebar**. Edit by hand. |
| `assets/js/banking-core.js` | Shared helpers: rounding, ₹ formatting, number to words, dates, toasts |
| `assets/js/calculators/*-engine.js` | Calculation logic of each tool, separate from the page so it can be tested |
| `assets/css/banking-theme.css` | Shared look for all tool pages |
| `tools/*.html` | One page per calculator |
| `supabase/migrations/` | Loan Charges database changes (admin access) |
| `tests/` | Tests for the engines |

## Loan Charges admin (`admin.html`)

Administrators edit loan charges at `admin.html` (not listed in the sidebar): scheme code, name, order, active/inactive, and every charge line (key, label, type, formula / default / dropdown choices, included in total). Formulas are checked with the same engine the calculator uses, a Preview column shows the result using each line's default value, and a confirmation lists every change before saving.

Saving goes through the database function `admin_save_loan_scheme()`, which re-checks that the user is an admin, refuses to overwrite a scheme someone else saved in the meantime, saves the scheme and its lines in one transaction, and records who changed what in `loan_scheme_audit`. The public key still cannot write to the loan tables. The Loan Charges page checks the server every time it opens, so saved changes appear on the next open (or Refresh).

One-time setup:

1. Apply `supabase/migrations/20261012120000_loan_admin.sql` (SQL Editor, or `npx supabase db push --linked`).
2. Supabase Dashboard → Authentication → Users → **Add user** (email + password) for each administrator. Turn off public sign-ups under Authentication → Sign In / Providers.
3. Allow that user to edit (SQL Editor):
   ```sql
   insert into public.loan_admins (user_id, note)
   select id, 'Head office' from auth.users where email = 'admin@example.com';
   ```
   Remove access with `delete from public.loan_admins where user_id = ...`.

Admins are signed out when the tab closes or after 30 minutes without activity.

## Adding a calculator

1. Put the page in `tools/`, loading `../assets/css/banking-theme.css` and `../assets/js/banking-core.js`.
2. Add an entry to `assets/js/pages-manifest.js` (`file`, `name`, `icon`, `desc`).

## Tests

```
npm test
```

Node 18+; no packages to install. The tests cover the engines and `banking-core.js`.

## Rules worth knowing

- **DDS** (`tools/dds.html`, `assets/js/calculators/dds-engine.js`) matches the customer's approved results. Do not change it, or the shared rounding in `BankingCore.round` it depends on, without checking DDS results against the approved figures.
- **Loan Charges** fee schemes live in Supabase (`loan_schemes`, `loan_scheme_fields`), not in the code. Edit them on `admin.html`. Formulas refer to other lines by key (e.g. `amount*1%`).
- Dates: use `BankingCore.dates.todayISO()` for "today" in date inputs; `toISOString()` gives yesterday between 00:00 and 05:30 IST.
