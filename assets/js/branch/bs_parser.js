/* ==========================================================================
   Branch Balance Sheet — Excel parser
   Reads a single-branch, two-sided balance sheet export (Liabilities | Assets)
   and turns it into groups of line items with their reported subtotals.
   Works in the browser (window.BSParser) and in Node (module.exports).
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------- Small helpers ---------- */
  function clean(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function normKey(v) {
    return clean(v).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  // Accepts numbers or strings like "1,23,456.78", "(500.00)", "-12", "450.00 Cr", "450 Dr"
  function parseNumber(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = clean(v);
    if (!s) return null;
    let sign = 1;
    if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
    const drCr = s.match(/\s*(DR|CR)\.?$/i);
    if (drCr) s = s.slice(0, drCr.index);
    s = s.replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
    if (!/^[-+]?\d*\.?\d+$/.test(s)) return null;
    const n = parseFloat(s) * sign;
    return isFinite(n) ? n : null;
  }

  function parseDateText(s) {
    const m = clean(s).match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!m) return null;
    let y = +m[3];
    if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]);
    return (d.getMonth() === +m[2] - 1 && d.getDate() === +m[1]) ? d : null;
  }

  // File names like "CH 21102026.xlsx" carry the date as DDMMYYYY
  function dateFromFileName(name) {
    const m = String(name || '').match(/(\d{2})(\d{2})(\d{4})/);
    if (!m) return null;
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return (d.getMonth() === +m[2] - 1 && d.getDate() === +m[1]) ? d : null;
  }

  /* ---------- Account head classification ----------
     Each group of the balance sheet is mapped to one analytical category.
     Order matters: the first matching rule wins. */
  const CATEGORIES = {
    L_CAP:       { side: 'L', label: 'Share Capital', family: 'funds' },
    L_RES:       { side: 'L', label: 'Reserves & Funds', family: 'funds' },
    L_DEP_SAV:   { side: 'L', label: 'Savings & Demand Deposits', family: 'deposits' },
    L_DEP_TERM:  { side: 'L', label: 'Term Deposits', family: 'deposits' },
    L_BORR:      { side: 'L', label: 'Borrowings / Overdraft', family: 'other' },
    L_INTPAY:    { side: 'L', label: 'Interest Payable on Deposits', family: 'other' },
    L_OIR:       { side: 'L', label: 'Overdue Interest Reserve', family: 'other' },
    L_STAT:      { side: 'L', label: 'GST / TDS & Statutory Dues', family: 'other' },
    L_OTH:       { side: 'L', label: 'Other Liabilities', family: 'other' },
    L_HO:        { side: 'L', label: 'Head Office Account (Cr)', family: 'ho' },
    L_PL:        { side: 'L', label: 'Profit & Loss (Profit)', family: 'pl' },
    A_CASH:      { side: 'A', label: 'Cash in Hand', family: 'liquid' },
    A_BANK:      { side: 'A', label: 'Balances with Banks', family: 'liquid' },
    A_INV:       { side: 'A', label: 'Investments (Bank FDs)', family: 'liquid' },
    A_SEC:       { side: 'A', label: 'Security Deposits Paid', family: 'other' },
    A_LOAN_SEC:  { side: 'A', label: 'Secured Loans', family: 'loans' },
    A_LOAN_UNS:  { side: 'A', label: 'Unsecured Loans', family: 'loans' },
    A_FIX:       { side: 'A', label: 'Fixed Assets', family: 'other' },
    A_INTREC:    { side: 'A', label: 'Interest Receivable', family: 'other' },
    A_OTH:       { side: 'A', label: 'Other Assets', family: 'other' },
    A_HO:        { side: 'A', label: 'Head Office Account (Dr)', family: 'ho' },
    A_PL:        { side: 'A', label: 'Profit & Loss (Loss)', family: 'pl' }
  };

  const LIAB_RULES = [
    [/SHARE CAPITAL/, 'L_CAP'],
    [/PROFIT|LOSS/, 'L_PL'],
    [/HEAD OFFICE|BRANCH/, 'L_HO'],
    [/TERM DEPOSIT|FIXED DEPOSIT/, 'L_DEP_TERM'],
    [/INTEREST (ACCRUED|PAYABLE)|ACCRUED/, 'L_INTPAY'],
    [/OVERDUE INTEREST RESERVE|\bOIR\b/, 'L_OIR'],
    [/GST|TDS|TAX|UNPAID DIVIDEND/, 'L_STAT'],
    [/DEPOSIT/, 'L_DEP_SAV'],
    [/RESERVE|FUND/, 'L_RES'],
    [/OVERDRAFT|BORROW/, 'L_BORR'],
    [/OTHER LIAB|PROVISION|PAYABLE|SUSPENSE/, 'L_OTH']
  ];

  const ASSET_RULES = [
    [/PROFIT|LOSS/, 'A_PL'],
    [/HEAD OFFICE|BRANCHES/, 'A_HO'],
    [/CASH AT BANK|BALANCE WITH BANK|BANK BALANCE/, 'A_BANK'],
    [/CASH/, 'A_CASH'],
    [/\bF ?D\b|FIXED DEPOSIT WITH|INVESTMENT|SHARES/, 'A_INV'],
    [/SECURITY DEPOSIT/, 'A_SEC'],
    [/UNSECURED/, 'A_LOAN_UNS'],
    [/LOAN|ADVANCE|OVERDRAFT/, 'A_LOAN_SEC'],
    [/FIXED ASSET|EQUIPMENT|FURNITURE|COMPUTER|VEHICLE|BUILDING|PREMISES/, 'A_FIX'],
    [/INTEREST RECEIVABLE/, 'A_INTREC']
  ];

  // Item-level overrides: these heads sit inside generic groups but matter on their own
  const ITEM_OVERRIDES = [
    { side: 'L', re: /OVERDUE INTEREST RESERVE/, cat: 'L_OIR' },
    { side: 'L', re: /\bTDS\b|\bGST\b|CGST|SGST|IGST/, cat: 'L_STAT' },
    { side: 'A', re: /INTEREST RECEIVABLE/, cat: 'A_INTREC' },
    { side: 'A', re: /^CASH (IN|ON) HAND|^CASH BALANCE/, cat: 'A_CASH' }
  ];

  function classifyGroup(side, header) {
    const key = normKey(header).replace(/\s+/g, ' ');
    const rules = side === 'L' ? LIAB_RULES : ASSET_RULES;
    for (const [re, cat] of rules) if (re.test(key)) return cat;
    return side === 'L' ? 'L_OTH' : 'A_OTH';
  }

  function classifyItem(side, groupCat, itemName) {
    const key = normKey(itemName);
    for (const o of ITEM_OVERRIDES) if (o.side === side && o.re.test(key)) return o.cat;
    return groupCat;
  }

  /* ---------- Layout detection ---------- */
  const SIDE_HEADS = {
    BS: { left: /^LIABILIT/i, right: /^ASSET/i },
    PL: { left: /^(EXPENDITURE|EXPENSE)/i, right: /^INCOME/i }
  };

  function findHeaderRow(grid, kind) {
    const heads = SIDE_HEADS[kind];
    for (let r = 0; r < Math.min(grid.length, 60); r++) {
      const row = grid[r] || [];
      let left = -1, right = -1;
      row.forEach((c, i) => {
        const t = clean(c);
        if (left < 0 && heads.left.test(t)) left = i;
        else if (left >= 0 && right < 0 && heads.right.test(t)) right = i;
      });
      if (left >= 0 && right > left) return { row: r, left, right };
    }
    return null;
  }

  // Columns titled Amount / Balance between a label column and the end of that side
  function amountColumns(row, from, to) {
    const cols = [];
    for (let i = from + 1; i < to; i++) {
      if (/^(AMOUNT|BALANCE|TOTAL|RS|₹)/i.test(clean(row[i]))) cols.push(i);
    }
    return cols;
  }

  function levelOf(col, amtCols) {
    let lvl = -1;
    amtCols.forEach((c, i) => { if (col >= c) lvl = i; });
    return lvl;
  }

  /* ---------- Side walker: builds groups from rows ---------- */
  function readSide(grid, startRow, side, labelFrom, labelTo, amtCols, sideEnd) {
    const groups = [];
    const sections = [];
    const emptyHeads = [];
    let lastHeader = '';
    let headerHadItems = true;
    let current = null;
    let sectionGroups = [];
    let grandTotal = null;

    const closeGroup = (reported) => {
      if (!current) return;
      current.computed = current.items.reduce((s, it) => s + it.amount, 0);
      current.reported = reported;
      groups.push(current);
      sectionGroups.push(current);
      current = null;
    };

    for (let r = startRow; r < grid.length; r++) {
      const row = grid[r] || [];
      let label = '';
      for (let c = labelFrom; c < labelTo; c++) {
        const t = clean(row[c]);
        if (t && parseNumber(t) === null) { label = t; break; }
      }

      if (/GRAND\s*TOTAL/i.test(label)) {
        for (let c = labelFrom; c < sideEnd; c++) {
          const n = parseNumber(row[c]);
          if (n !== null) { grandTotal = n; break; }
        }
        closeGroup(null);
        return { groups, sections, emptyHeads, grandTotal, endRow: r };
      }

      let num = null, lvl = -1;
      for (let c = amtCols[0]; c < sideEnd; c++) {
        const n = parseNumber(row[c]);
        if (n !== null && clean(row[c]) !== '') { num = n; lvl = levelOf(c, amtCols); break; }
      }

      if (label && num === null) {
        // Heading row. A heading that never received items is a nil head.
        if (!headerHadItems && lastHeader) emptyHeads.push(lastHeader);
        if (current && current.items.length) closeGroup(null);
        lastHeader = label;
        headerHadItems = false;
      } else if (label && num !== null) {
        if (!current) current = { side, header: lastHeader || label, items: [], row: r };
        current.items.push({ name: label, amount: num, row: r });
        headerHadItems = true;
      } else if (num !== null) {
        if (lvl <= 0 && amtCols.length > 1) {
          // Stray number in the item column without a label: keep it visible
          if (!current) current = { side, header: lastHeader || 'Unlabelled', items: [], row: r };
          current.items.push({ name: '(Unlabelled amount)', amount: num, row: r });
          headerHadItems = true;
        } else if (lvl === amtCols.length - 1 && amtCols.length > 1) {
          closeGroup(null);
          const total = sectionGroups.reduce((s, g) => s + g.computed, 0);
          sections.push({ groups: sectionGroups, reported: num, computed: total });
          sectionGroups = [];
        } else {
          // Group subtotal
          if (current) closeGroup(num);
          else if (groups.length && groups[groups.length - 1].reported === null) groups[groups.length - 1].reported = num;
        }
      }
    }
    closeGroup(null);
    return { groups, sections, emptyHeads, grandTotal, endRow: grid.length - 1 };
  }

  /* ---------- Metadata (branch, date, society) ---------- */
  function readMeta(grid, headerRow, fileName) {
    const meta = { society: '', branch: '', branchCode: '', fromBranch: '', toBranch: '', date: null, dateText: '' };
    for (let r = 0; r < headerRow; r++) {
      (grid[r] || []).forEach(c => {
        const t = clean(c);
        if (!t) return;
        let m;
        if (!meta.society && /(CO-?\s?OP|CREDIT SOCIETY|BANK LTD|SOCIETY)/i.test(t) && !/BRANCH\s*:/i.test(t)) meta.society = t;
        if ((m = t.match(/From Branch\s*:\s*(.*?)\s+To\s+(.*)$/i))) {
          meta.fromBranch = clean(m[1]);
          meta.toBranch = clean(m[2]);
          const code = meta.fromBranch.match(/^(\d+)\s*-/);
          if (code) meta.branchCode = code[1];
        } else if ((m = t.match(/^Branch\s*:\s*(.+)$/i))) {
          meta.branch = clean(m[1]);
        }
        if ((m = t.match(/As\s*On\s*:?\s*(.+)$/i)) && !meta.date) {
          meta.date = parseDateText(m[1]);
          meta.dateText = clean(m[1]);
        }
      });
    }
    if (!meta.date) {
      meta.date = dateFromFileName(fileName);
      meta.dateSource = meta.date ? 'file name' : '';
    } else {
      meta.dateSource = 'sheet';
    }
    if (!meta.branch && meta.fromBranch) meta.branch = meta.fromBranch.replace(/^\d+\s*-\s*/, '');
    return meta;
  }

  // A branch sheet must cover one branch only (From = To) and not be a consolidated/HO report
  function consolidationProblem(meta) {
    if (meta.fromBranch && meta.toBranch && normKey(meta.fromBranch) !== normKey(meta.toBranch)) {
      return bsError('RANGE', `This sheet covers a range of branches (${meta.fromBranch} to ${meta.toBranch}). Please upload a single-branch balance sheet.`,
        { from: meta.fromBranch, to: meta.toBranch });
    }
    if (/\b(ALL BRANCHES|CONSOLIDATED|HEAD OFFICE|H\.?O\.?)\b/i.test(meta.branch)) {
      return bsError('CONSOLIDATED', `"${meta.branch}" looks like a consolidated / Head Office report. This dashboard analyses individual branch balance sheets only.`,
        { branch: meta.branch });
    }
    return null;
  }

  // Errors carry a code + params so the page can show them in its own language
  function bsError(code, message, params) {
    const e = new Error(message);
    e.code = code;
    e.params = params || {};
    return e;
  }

  /* ---------- Statement builder ---------- */
  function buildStatement(grid, kind) {
    const head = findHeaderRow(grid, kind);
    if (!head) return null;
    const hdr = grid[head.row];
    const leftAmt = amountColumns(hdr, head.left, head.right);
    const rightAmt = amountColumns(hdr, head.right, Math.max(hdr.length, head.right + 12));
    if (!leftAmt.length || !rightAmt.length) return null;
    const rowLen = grid.reduce((m, r) => Math.max(m, (r || []).length), 0);

    const left = readSide(grid, head.row + 1, 'L', 0, leftAmt[0], leftAmt, head.right);
    const right = readSide(grid, head.row + 1, 'A', head.right, rightAmt[0], rightAmt, rowLen);

    // Grand Total row is printed once across the sheet: pick each side's figure from that row
    const gtRow = Math.min(left.endRow, right.endRow);
    if (/GRAND\s*TOTAL/i.test((grid[gtRow] || []).map(clean).join(' '))) {
      const nums = [];
      (grid[gtRow] || []).forEach((c, i) => {
        const n = parseNumber(c);
        if (n !== null && clean(c) !== '') nums.push({ i, n });
      });
      const l = nums.filter(x => x.i < head.right);
      const a = nums.filter(x => x.i >= head.right);
      if (l.length) left.grandTotal = l[0].n;
      if (a.length) right.grandTotal = a[0].n;
    }

    const lines = [];
    [left, right].forEach(sideData => {
      sideData.groups.forEach(g => {
        const gcat = classifyGroup(g.side, g.header);
        g.category = gcat;
        g.items.forEach(it => {
          lines.push({
            side: g.side,
            group: g.header,
            groupCategory: gcat,
            category: classifyItem(g.side, gcat, it.name),
            name: it.name,
            amount: it.amount,
            row: it.row + 1
          });
        });
      });
    });

    return { kind, headerRow: head.row, left, right, lines };
  }

  /* ---------- Integrity checks ---------- */
  const TOL = 0.5; // rupees; reports print to paise so allow rounding noise

  function integrity(stmt) {
    const checks = [];
    const sideName = { L: 'Liabilities', A: 'Assets' };
    [stmt.left, stmt.right].forEach((s, idx) => {
      const side = idx === 0 ? 'L' : 'A';
      const computed = s.groups.reduce((t, g) => t + g.computed, 0);
      if (s.grandTotal !== null) {
        checks.push({
          ok: Math.abs(computed - s.grandTotal) < TOL,
          code: 'itemsGT', side,
          label: `${sideName[side]}: sum of line items equals Grand Total`,
          detail: `Items ${computed.toFixed(2)} vs Grand Total ${s.grandTotal.toFixed(2)}`
        });
      }
      const badGroups = s.groups.filter(g => g.reported !== null && Math.abs(g.reported - g.computed) >= TOL);
      checks.push({
        ok: badGroups.length === 0,
        code: 'groups', side, count: s.groups.length,
        label: `${sideName[side]}: every group subtotal agrees with its items (${s.groups.length} groups)`,
        detail: badGroups.map(g => `${g.header}: items ${g.computed.toFixed(2)} vs subtotal ${g.reported.toFixed(2)}`).join('; ')
      });
      const badSections = s.sections.filter(x => Math.abs(x.reported - x.computed) >= TOL);
      checks.push({
        ok: badSections.length === 0,
        code: 'sections', side, count: s.sections.length,
        label: `${sideName[side]}: every section total agrees with its groups (${s.sections.length} sections)`,
        detail: badSections.map(x => `${x.groups.map(g => g.header).join(' + ')}: ${x.computed.toFixed(2)} vs ${x.reported.toFixed(2)}`).join('; ')
      });
    });
    if (stmt.left.grandTotal !== null && stmt.right.grandTotal !== null) {
      checks.push({
        ok: Math.abs(stmt.left.grandTotal - stmt.right.grandTotal) < TOL,
        code: 'tally',
        label: 'Balance sheet tallies (Liabilities = Assets)',
        detail: `${stmt.left.grandTotal.toFixed(2)} vs ${stmt.right.grandTotal.toFixed(2)}`
      });
    }
    return checks;
  }

  /* ---------- Public entry ---------- */
  function parseWorkbook(XLSX, data, fileName) {
    const wb = XLSX.read(data, { type: 'array', cellDates: false, raw: false });
    let best = null;
    let plStmt = null;
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
      const bs = buildStatement(grid, 'BS');
      if (bs && bs.lines.length && (!best || bs.lines.length > best.stmt.lines.length)) {
        best = { stmt: bs, grid, sheetName };
      }
      const pl = buildStatement(grid, 'PL');
      if (pl && pl.lines.length && !plStmt) plStmt = { stmt: pl, grid, sheetName };
    }
    if (!best) {
      throw bsError('NO_BS', 'No branch balance sheet found. Expected a sheet with "Liability" and "Assets" columns (Amount / Balance).');
    }
    const meta = readMeta(best.grid, best.stmt.headerRow, fileName);
    const problem = consolidationProblem(meta);
    if (problem) throw problem;
    if (!meta.date) throw bsError('NO_DATE', 'Could not find the "Balance Sheet As On" date in the sheet or the file name.');

    const result = {
      fileName,
      sheetName: best.sheetName,
      meta,
      lines: best.stmt.lines,
      totals: { L: best.stmt.left.grandTotal, A: best.stmt.right.grandTotal },
      emptyHeads: { L: best.stmt.left.emptyHeads, A: best.stmt.right.emptyHeads },
      checks: integrity(best.stmt),
      incomeExpense: null
    };
    if (plStmt) {
      // Income & Expenditure statement in the same workbook (left = expenses, right = income)
      result.incomeExpense = {
        sheetName: plStmt.sheetName,
        lines: plStmt.stmt.lines.map(l => ({
          side: l.side === 'L' ? 'E' : 'I',
          group: l.group,
          name: l.name,
          amount: l.amount
        })),
        totals: { E: plStmt.stmt.left.grandTotal, I: plStmt.stmt.right.grandTotal }
      };
    }
    return result;
  }

  const api = { parseWorkbook, parseNumber, parseDateText, dateFromFileName, normKey, clean, CATEGORIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BSParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
