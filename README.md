# Quick Access Calculator

Banking calculator workstation for branch staff: one shell (`index.html`) with a sidebar, a Ctrl+K switcher and a daily task list. Each calculator is its own page in `tools/`, opened inside the shell.

## Running

Open `index.html` in a browser. No build step and no server needed (it also works on GitHub Pages / Cloudflare Pages).
Loan Charges needs internet the first time, to load schemes from Supabase; after that it also works offline.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `assets/js/main.js`, `assets/css/main.css` | Shell: sidebar, switcher, dashboard tasks |
| `assets/js/pages-manifest.js` | **List of tools in the sidebar**. Edit by hand. |
| `assets/js/banking-core.js` | Shared helpers: rounding, ₹ formatting, number to words, dates, toasts |
| `assets/js/calculators/*-engine.js` | Calculation logic of each tool, separate from the page so it can be tested |
| `assets/css/banking-theme.css` | Shared look for all tool pages |
| `tools/*.html` | One page per calculator |
| `supabase/` | Loan Charges database: migrations, backup, [README](supabase/README.md) |
| `tests/` | Tests for the engines |

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
- **Loan Charges** fee schemes live in Supabase (`loan_schemes`, `loan_scheme_fields`), not in the code. Formulas refer to other lines by key (e.g. `amount*1%`); see `supabase/README.md`.
- Dates: use `BankingCore.dates.todayISO()` for "today" in date inputs; `toISOString()` gives yesterday between 00:00 and 05:30 IST.
