/* ==========================================================================
   Branch Balance Sheet — comparison, ratios and insights
   Input: two parsed balance sheets of the SAME branch (older first).
   Everything here is branch-level; no Head Office / consolidated logic.
   ========================================================================== */
(function (root) {
  'use strict';

  const P = root.BSParser || (typeof require !== 'undefined' ? require('./bs_parser.js') : null);
  const CATS = P.CATEGORIES;
  const DAY = 86400000;

  /* ---------- Generic helpers ---------- */
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const safeDiv = (a, b) => (b ? a / b : null);
  const pctChange = (a, b) => (a ? ((b - a) / Math.abs(a)) * 100 : null);
  const round2 = n => Math.round(n * 100) / 100;

  // Indian financial year: 1 April – 31 March
  function fyInfo(d) {
    const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    const start = new Date(startYear, 3, 1);
    const end = new Date(startYear + 1, 2, 31);
    const daysInFY = Math.round((end - start) / DAY) + 1;
    const elapsed = Math.round((d - start) / DAY) + 1;
    return { label: `FY ${startYear}-${String(startYear + 1).slice(2)}`, startYear, daysInFY, elapsed };
  }

  function catTotals(lines) {
    const t = {};
    Object.keys(CATS).forEach(k => { t[k] = 0; });
    lines.forEach(l => { t[l.category] = (t[l.category] || 0) + l.amount; });
    return t;
  }

  /* ---------- Per-period aggregates ---------- */
  function aggregates(p) {
    const c = catTotals(p.lines);
    const lineSum = side => sum(p.lines.filter(l => l.side === side), l => l.amount);
    const total = p.totals.A != null ? p.totals.A : lineSum('A');
    const deposits = c.L_DEP_SAV + c.L_DEP_TERM;
    const loans = c.A_LOAN_SEC + c.A_LOAN_UNS;
    const gold = sum(p.lines.filter(l => l.side === 'A' && /GOLD/i.test(l.name) && CATS[l.category].family === 'loans'), l => l.amount);
    const fy = fyInfo(p.meta.date);
    const profit = c.L_PL - c.A_PL;
    return {
      cat: c,
      total,
      totalL: p.totals.L != null ? p.totals.L : lineSum('L'),
      deposits,
      savings: c.L_DEP_SAV,
      term: c.L_DEP_TERM,
      loans,
      securedLoans: c.A_LOAN_SEC,
      unsecuredLoans: c.A_LOAN_UNS,
      goldLoans: gold,
      business: deposits + loans,
      cash: c.A_CASH,
      bank: c.A_BANK,
      investments: c.A_INV,
      liquid: c.A_CASH + c.A_BANK + c.A_INV,
      hoAsset: c.A_HO,
      hoLiab: c.L_HO,
      hoNet: c.A_HO - c.L_HO,
      oir: c.L_OIR,
      intReceivable: c.A_INTREC,
      intPayable: c.L_INTPAY,
      fixedAssets: c.A_FIX,
      reserves: c.L_RES + c.L_CAP,
      profit,
      fy,
      profitAnnualised: fy.elapsed > 0 ? profit * fy.daysInFY / fy.elapsed : null
    };
  }

  /* ---------- Line-item comparison ---------- */
  function lineMap(lines) {
    const m = new Map();
    lines.forEach(l => {
      const key = `${l.side}|${l.category}|${P.normKey(l.name)}`;
      const prev = m.get(key);
      if (prev) { prev.amount += l.amount; prev.dupes += 1; }
      else m.set(key, { ...l, dupes: 1 });
    });
    return m;
  }

  function compareLines(pa, pb) {
    const ma = lineMap(pa.lines);
    const mb = lineMap(pb.lines);
    const keys = new Set([...ma.keys(), ...mb.keys()]);
    const rows = [];
    keys.forEach(key => {
      const la = ma.get(key);
      const lb = mb.get(key);
      const ref = lb || la;
      const a = la ? la.amount : 0;
      const b = lb ? lb.amount : 0;
      const diff = round2(b - a);
      let status = 'flat';
      if (!la) status = 'new';
      else if (!lb) status = 'closed';
      else if (Math.abs(diff) >= 0.5) status = diff > 0 ? 'up' : 'down';
      rows.push({
        key,
        side: ref.side,
        category: ref.category,
        categoryLabel: CATS[ref.category].label,
        family: CATS[ref.category].family,
        group: ref.group,
        name: ref.name,
        a, b, diff,
        pct: la && lb ? pctChange(a, b) : null,
        status,
        order: lb ? lb.row : la.row + 10000
      });
    });
    const sideOrder = { L: 0, A: 1 };
    rows.sort((x, y) => sideOrder[x.side] - sideOrder[y.side] || x.order - y.order);
    return rows;
  }

  /* ---------- Ratios ---------- */
  function ratioDefs() {
    return [
      { id: 'cd', group: 'Deployment', label: 'CD Ratio (Loans ÷ Deposits)', calc: g => safeDiv(g.loans, g.deposits), better: 'up',
        explain: 'Share of branch deposits lent out locally. Higher means the branch is deploying the funds it mobilises; very low means most money sits with Head Office.' },
      { id: 'loanAssets', group: 'Deployment', label: 'Loans ÷ Total Assets', calc: g => safeDiv(g.loans, g.total), better: 'up',
        explain: 'Portion of the branch balance sheet that is earning loan interest.' },
      { id: 'hoShare', group: 'Deployment', label: 'Funds with Head Office ÷ Total Assets', calc: g => safeDiv(g.hoNet, g.total), better: 'down',
        explain: 'Surplus funds the branch has passed to Head Office. A falling share means more of the branch\'s own money is lent locally.' },
      { id: 'casa', group: 'Deposit Mix', label: 'Savings & Demand Deposits ÷ Total Deposits', calc: g => safeDiv(g.savings, g.deposits), better: 'up',
        explain: 'Low-cost deposits (savings, daily, recurring). A higher share keeps the cost of deposits down.' },
      { id: 'termShare', group: 'Deposit Mix', label: 'Term Deposits ÷ Total Deposits', calc: g => safeDiv(g.term, g.deposits), better: 'neutral',
        explain: 'Fixed-tenure deposits. Stable funding, but they carry higher interest cost.' },
      { id: 'intPayTerm', group: 'Deposit Mix', label: 'Interest Payable ÷ Term Deposits', calc: g => safeDiv(g.intPayable, g.term), better: 'neutral',
        explain: 'Interest accrued on deposits but not yet paid, relative to term deposits.' },
      { id: 'secured', group: 'Loan Quality', label: 'Secured Loans ÷ Total Loans', calc: g => safeDiv(g.securedLoans, g.loans), better: 'up',
        explain: 'Loans backed by security (gold, property, deposits, vehicles). Higher means lower credit risk.' },
      { id: 'unsecured', group: 'Loan Quality', label: 'Unsecured Loans ÷ Total Loans', calc: g => safeDiv(g.unsecuredLoans, g.loans), better: 'down',
        explain: 'Personal and arbitration loans without security. Needs close monitoring.' },
      { id: 'gold', group: 'Loan Quality', label: 'Gold Loans ÷ Total Loans', calc: g => safeDiv(g.goldLoans, g.loans), better: 'neutral',
        explain: 'Share of the portfolio in gold loans: well secured and quick to recover, but sensitive to gold prices.' },
      { id: 'oir', group: 'Loan Quality', label: 'Overdue Interest Reserve ÷ Total Loans', calc: g => safeDiv(g.oir, g.loans), better: 'down',
        explain: 'Interest due from borrowers but not collected (kept in reserve). A rising ratio signals growing overdues.' },
      { id: 'cashDep', group: 'Liquidity', label: 'Cash in Hand ÷ Deposits', calc: g => safeDiv(g.cash, g.deposits), better: 'neutral',
        explain: 'Physical cash held at the branch. Too high is idle money; too low can strain daily withdrawals.' },
      { id: 'liquidDep', group: 'Liquidity', label: 'Cash, Bank & Investments ÷ Deposits', calc: g => safeDiv(g.liquid, g.deposits), better: 'neutral',
        explain: 'Funds the branch can access immediately without depending on Head Office.' },
      { id: 'fixed', group: 'Efficiency', label: 'Fixed Assets ÷ Total Assets', calc: g => safeDiv(g.fixedAssets, g.total), better: 'neutral',
        explain: 'Furniture, computers and equipment held by the branch.' },
      { id: 'roa', group: 'Profitability', label: 'Return on Assets (annualised)', calc: g => safeDiv(g.profitAnnualised, g.total), better: 'up',
        explain: 'Financial-year-to-date profit scaled to a full year, divided by total assets on that date.' },
      { id: 'profitDep', group: 'Profitability', label: 'Annualised Profit ÷ Deposits', calc: g => safeDiv(g.profitAnnualised, g.deposits), better: 'up',
        explain: 'Profit earned for every ₹100 of deposits, on a full-year basis.' }
    ];
  }

  function computeRatios(ga, gb) {
    return ratioDefs().map(d => {
      const a = d.calc(ga);
      const b = d.calc(gb);
      const change = a != null && b != null ? (b - a) * 100 : null; // percentage points
      let signal = 'neutral';
      if (change != null && Math.abs(change) >= 0.05 && d.better !== 'neutral') {
        signal = (change > 0) === (d.better === 'up') ? 'good' : 'bad';
      }
      return { ...d, a, b, change, signal };
    });
  }

  /* ---------- Product tables (deposits / loans) ---------- */
  function productTable(rows, family, ga, gb, totalKey) {
    const list = rows.filter(r => r.family === family);
    const ta = ga[totalKey];
    const tb = gb[totalKey];
    return list.map(r => ({
      ...r,
      shareA: safeDiv(r.a, ta),
      shareB: safeDiv(r.b, tb),
      contribution: safeDiv(r.diff, Math.abs(tb - ta) || null)
    }));
  }

  /* ---------- Main entry ---------- */
  function compare(pa, pb) {
    const ga = aggregates(pa);
    const gb = aggregates(pb);
    const rows = compareLines(pa, pb);
    const days = Math.round((pb.meta.date - pa.meta.date) / DAY);
    const sameFY = ga.fy.startYear === gb.fy.startYear;

    const cats = Object.keys(CATS).map(id => ({
      id, ...CATS[id],
      a: ga.cat[id] || 0,
      b: gb.cat[id] || 0,
      diff: (gb.cat[id] || 0) - (ga.cat[id] || 0),
      pct: pctChange(ga.cat[id] || 0, gb.cat[id] || 0)
    })).filter(c => c.a || c.b);

    return {
      branch: pb.meta.branch,
      branchCode: pb.meta.branchCode,
      society: pb.meta.society || pa.meta.society,
      A: pa, B: pb,
      ga, gb,
      days, sameFY,
      rows,
      cats,
      deposits: productTable(rows, 'deposits', ga, gb, 'deposits'),
      loans: productTable(rows, 'loans', ga, gb, 'loans'),
      ratios: computeRatios(ga, gb)
    };
  }

  /* ---------- Variations ---------- */
  function variations(model, opts) {
    const pctLimit = opts.pct;
    const minAmt = opts.minAmount;
    return model.rows
      .filter(r => r.family !== 'pl')
      .filter(r => {
        if (Math.abs(r.diff) < minAmt) return false;
        if (r.status === 'new' || r.status === 'closed') return true;
        return r.pct != null && Math.abs(r.pct) >= pctLimit;
      })
      .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  }

  /* ---------- Insights (plain language, any UI language) ----------
     f = { t, amt, pct, signed, signedPct, pp, head, fy } supplied by the page. */
  function topMovers(list, n, dir) {
    return list
      .filter(r => (dir > 0 ? r.diff > 0 : r.diff < 0))
      .sort((x, y) => (dir > 0 ? y.diff - x.diff : x.diff - y.diff))
      .slice(0, n);
  }

  function buildInsights(m, f) {
    const out = [];
    const { t } = f;
    const add = (tone, area, title, text) => out.push({ tone, area: t(`area.${area}`), title, text });
    const { ga, gb } = m;
    const pc = (a, b) => pctChange(a, b);
    const names = list => list.map(r => `${f.head(r.name)} (${f.signed(r.diff)})`).join(', ');

    // 1. Size
    const sizeChg = pc(ga.total, gb.total);
    add(sizeChg >= 0 ? 'good' : 'watch', 'overall',
      t(sizeChg >= 0 ? 'i.size.up' : 'i.size.down', { p: f.signedPct(sizeChg) }),
      t('i.size.text', { a: f.amt(ga.total), b: f.amt(gb.total), d: f.signed(gb.total - ga.total), n: m.days }));

    // 2. Deposits
    const depChg = pc(ga.deposits, gb.deposits);
    const depUp = topMovers(m.deposits, 3, 1);
    const depDown = topMovers(m.deposits, 3, -1);
    add(depChg >= 0 ? 'good' : (depChg < -2 ? 'risk' : 'watch'), 'deposits',
      t(depChg >= 0 ? 'i.dep.up' : 'i.dep.down', { p: f.signedPct(depChg), d: f.signed(gb.deposits - ga.deposits) }),
      t('i.dep.text', { a: f.amt(ga.deposits), b: f.amt(gb.deposits) }) +
      (depUp.length ? t('i.dep.grew', { list: names(depUp) }) : '') +
      (depDown.length ? t('i.dep.fell', { list: names(depDown) }) : ''));

    // 3. Deposit mix
    const casaA = safeDiv(ga.savings, ga.deposits);
    const casaB = safeDiv(gb.savings, gb.deposits);
    if (casaA != null && casaB != null) {
      const d = (casaB - casaA) * 100;
      if (Math.abs(d) >= 0.5) {
        add(d > 0 ? 'good' : 'watch', 'deposits',
          t(d > 0 ? 'i.casa.up' : 'i.casa.down', { pp: f.pp(d) }),
          t('i.casa.text', { a: f.pct(casaA * 100), b: f.pct(casaB * 100) }) + t(d > 0 ? 'i.casa.good' : 'i.casa.bad'));
      }
    }

    // 4. Deposit concentration
    const depSorted = m.deposits.filter(r => r.b > 0).sort((x, y) => y.b - x.b);
    if (depSorted.length >= 3 && gb.deposits > 0) {
      const top = depSorted[0];
      const top3 = sum(depSorted.slice(0, 3), r => r.b) / gb.deposits * 100;
      add(top3 > 60 ? 'watch' : 'info', 'deposits',
        t('i.conc.title', { p: f.pct(top3) }),
        t('i.conc.text', { list: depSorted.slice(0, 3).map(r => f.head(r.name)).join(', '), top: f.head(top.name), s: f.pct(top.b / gb.deposits * 100) }) +
        (top3 > 60 ? t('i.conc.warn') : ''));
    }

    // 5. Loans
    const loanChg = pc(ga.loans, gb.loans);
    const loanUp = topMovers(m.loans, 3, 1);
    const loanDown = topMovers(m.loans, 3, -1);
    add(loanChg >= 0 ? 'good' : (loanChg < -2 ? 'risk' : 'watch'), 'loans',
      t(loanChg >= 0 ? 'i.loan.up' : 'i.loan.down', { p: f.signedPct(loanChg), d: f.signed(gb.loans - ga.loans) }),
      t('i.loan.text', { a: f.amt(ga.loans), b: f.amt(gb.loans) }) +
      (loanUp.length ? t('i.loan.grew', { list: names(loanUp) }) : '') +
      (loanDown.length ? t('i.loan.fell', { list: names(loanDown) }) : ''));

    // 6. CD ratio
    const cdA = safeDiv(ga.loans, ga.deposits);
    const cdB = safeDiv(gb.loans, gb.deposits);
    if (cdA != null && cdB != null) {
      const d = (cdB - cdA) * 100;
      add(cdB < 0.4 ? 'watch' : (d >= 0 ? 'good' : 'watch'), 'deployment',
        t('i.cd.title', { a: f.pct(cdA * 100), b: f.pct(cdB * 100), pp: f.pp(d) }),
        t('i.cd.text', { n: (cdB * 100).toFixed(0) }) + (cdB < 0.4 ? t('i.cd.low') : ''));
    }

    // 7. Funds with HO
    if (gb.hoNet) {
      add('info', 'deployment', t('i.ho.title', { p: f.pct(gb.hoNet / gb.total * 100) }),
        t(gb.hoNet > 0 ? 'i.ho.pos' : 'i.ho.neg', { a: f.amt(ga.hoNet), b: f.amt(gb.hoNet), d: f.signed(gb.hoNet - ga.hoNet) }));
    }

    // 8. Overdue interest reserve
    if (ga.oir || gb.oir) {
      const oA = safeDiv(ga.oir, ga.loans) || 0;
      const oB = safeDiv(gb.oir, gb.loans) || 0;
      const d = (oB - oA) * 100;
      add(d > 0.1 ? 'risk' : (d < -0.1 ? 'good' : 'info'), 'quality',
        t(gb.oir >= ga.oir ? 'i.oir.up' : 'i.oir.down', { p: f.signedPct(pc(ga.oir, gb.oir)), s: f.pct(oB * 100) }),
        t('i.oir.text', { a: f.amt(ga.oir), b: f.amt(gb.oir) }) +
        (d > 0.1 && loanChg < 0 ? t('i.oir.shrink') : d > 0.1 ? t('i.oir.rise') : d < -0.1 ? t('i.oir.better') : ''));
    }

    // 9. Unsecured exposure
    const unsA = safeDiv(ga.unsecuredLoans, ga.loans);
    const unsB = safeDiv(gb.unsecuredLoans, gb.loans);
    if (unsB != null && gb.unsecuredLoans) {
      const d = unsA != null ? (unsB - unsA) * 100 : 0;
      const arb = m.loans.filter(r => /ARBITRATION/i.test(r.name));
      add(unsB > 0.1 ? 'watch' : (d > 0.05 ? 'info' : 'good'), 'quality',
        t('i.uns.title', { s: f.pct(unsB * 100), pp: f.pp(d) }),
        t('i.uns.text', { a: f.amt(ga.unsecuredLoans), b: f.amt(gb.unsecuredLoans) }) +
        (arb.some(r => r.b > 0) ? t('i.uns.arb', { v: f.amt(sum(arb, r => r.b)) }) : ''));
    }

    // 10. Loan concentration
    const loanSorted = m.loans.filter(r => r.b > 0).sort((x, y) => y.b - x.b);
    if (loanSorted.length && gb.loans > 0) {
      const share = loanSorted[0].b / gb.loans * 100;
      add(share > 40 ? 'watch' : 'info', 'loans',
        t('i.lconc.title', { top: f.head(loanSorted[0].name), s: f.pct(share) }),
        t('i.lconc.text', { list: loanSorted.slice(0, 3).map(r => `${f.head(r.name)} ${f.pct(r.b / gb.loans * 100)}`).join(', ') }));
    }

    // 11. Liquidity
    add(gb.liquid >= ga.liquid ? 'info' : 'watch', 'liquidity',
      t('i.liq.title', { a: f.amt(ga.liquid), b: f.amt(gb.liquid) }),
      t('i.liq.text', {
        ca: f.amt(ga.cash), cb: f.amt(gb.cash), cp: f.signedPct(pc(ga.cash, gb.cash)),
        ba: f.amt(ga.bank), bb: f.amt(gb.bank), bp: f.signedPct(pc(ga.bank, gb.bank)),
        s: f.pct(safeDiv(gb.cash, gb.deposits) * 100)
      }));

    // 12. Profit
    if (m.sameFY) {
      const earned = gb.profit - ga.profit;
      add(earned >= 0 ? 'good' : 'risk', 'profit',
        t('i.pl.same.title', { d: f.signed(earned) }),
        t('i.pl.same.text', { fy: f.fy(gb.fy), a: f.amt(ga.profit), b: f.amt(gb.profit), ann: f.amt(gb.profitAnnualised), roa: f.pct(safeDiv(gb.profitAnnualised, gb.total) * 100) }));
    } else {
      const rateChg = pc(ga.profitAnnualised, gb.profitAnnualised);
      add(gb.profit < 0 ? 'risk' : (rateChg >= 0 ? 'good' : 'watch'), 'profit',
        t(rateChg >= 0 ? 'i.pl.up' : 'i.pl.down', { fy: f.fy(ga.fy), p: f.signedPct(rateChg) }),
        t('i.pl.text', {
          fyA: f.fy(ga.fy), a: f.amt(ga.profit), nA: ga.fy.elapsed, annA: f.amt(ga.profitAnnualised),
          fyB: f.fy(gb.fy), b: f.amt(gb.profit), nB: gb.fy.elapsed, annB: f.amt(gb.profitAnnualised)
        }));
    }

    // 13. Interest payable
    if (ga.intPayable || gb.intPayable) {
      add('info', 'deposits', t('i.ip.title', { a: f.amt(ga.intPayable), b: f.amt(gb.intPayable) }),
        t('i.ip.text', { s: f.pct(safeDiv(gb.intPayable, gb.term) * 100), p: f.signedPct(pc(ga.intPayable, gb.intPayable)) }));
    }

    // 14. New / closed heads
    const fresh = m.rows.filter(r => r.status === 'new' && r.family !== 'pl');
    const closed = m.rows.filter(r => r.status === 'closed' && r.family !== 'pl');
    if (fresh.length) add('info', 'heads', t('i.new.title', { n: fresh.length }), fresh.map(r => `${f.head(r.name)} (${f.amt(r.b)})`).join(', ') + '.');
    if (closed.length) add('info', 'heads', t('i.closed.title', { n: closed.length }), closed.map(r => t('i.closed.item', { name: f.head(r.name), v: f.amt(r.a) })).join(', ') + '.');

    // 15. Sharp movements
    const sharp = m.rows.filter(r => r.status !== 'new' && r.status !== 'closed' && r.family !== 'pl' && r.family !== 'ho' &&
      r.pct != null && Math.abs(r.pct) >= 50 && Math.abs(r.diff) >= 0.005 * gb.total)
      .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)).slice(0, 4);
    if (sharp.length) {
      add('watch', 'unusual', t('i.sharp.title'),
        t('i.sharp.text', { list: sharp.map(r => `${f.head(r.name)} ${f.signedPct(r.pct)} (${f.amt(r.a)} → ${f.amt(r.b)})`).join('; ') }));
    }

    // 16. Totals check
    const failed = [...m.A.checks, ...m.B.checks].filter(c => !c.ok);
    add(failed.length ? 'risk' : 'good', 'check',
      failed.length ? t('i.chk.bad.title', { n: failed.length }) : t('i.chk.ok.title'),
      failed.length ? failed.map(c => c.detail).join('; ') : t('i.chk.ok.text'));

    return out;
  }

  /* ---------- Health check: seven simple traffic lights ----------
     Limits are indicative guides for a branch, not regulatory norms. */
  function healthCheck(m) {
    const { ga, gb } = m;
    const out = [];
    const growth = (a, b) => pctChange(a, b) || 0;
    const band = (v, goodIf, watchIf) => (goodIf(v) ? 'good' : watchIf(v) ? 'watch' : 'bad');

    const dg = growth(ga.deposits, gb.deposits);
    out.push({ id: 'dep', status: band(dg, v => v >= 0, v => v >= -2), kind: 'growth', value: dg, a: ga.deposits, b: gb.deposits });

    const lg = growth(ga.loans, gb.loans);
    out.push({ id: 'loan', status: band(lg, v => v >= 0, v => v >= -2), kind: 'growth', value: lg, a: ga.loans, b: gb.loans });

    const cdA = safeDiv(ga.loans, ga.deposits) || 0;
    const cdB = safeDiv(gb.loans, gb.deposits) || 0;
    out.push({ id: 'cd', status: band(cdB, v => v >= 0.5, v => v >= 0.3), kind: 'ratio', a: cdA, b: cdB });

    const oA = safeDiv(ga.oir, ga.loans) || 0;
    const oB = safeDiv(gb.oir, gb.loans) || 0;
    out.push({ id: 'oir', status: band((oB - oA) * 100, v => v <= 0, v => v <= 0.25), kind: 'ratio', a: oA, b: oB });

    let plStatus;
    if (gb.profit < 0) plStatus = 'bad';
    else if (!ga.profitAnnualised || ga.profitAnnualised <= 0) plStatus = 'good';
    else plStatus = band(gb.profitAnnualised / ga.profitAnnualised, v => v >= 1, v => v >= 0.8);
    out.push({ id: 'pl', status: plStatus, kind: 'profit', a: ga.profitAnnualised, b: gb.profitAnnualised, loss: gb.profit < 0 });

    const sA = safeDiv(ga.savings, ga.deposits) || 0;
    const sB = safeDiv(gb.savings, gb.deposits) || 0;
    out.push({ id: 'casa', status: band((sB - sA) * 100, v => v >= 0, v => v > -1), kind: 'ratio', a: sA, b: sB });

    const uA = safeDiv(ga.unsecuredLoans, ga.loans) || 0;
    const uB = safeDiv(gb.unsecuredLoans, gb.loans) || 0;
    const uStatus = uB > 0.15 ? 'bad' : (uB > 0.1 || (uB - uA) * 100 > 0.25) ? 'watch' : 'good';
    out.push({ id: 'uns', status: uStatus, kind: 'ratio', a: uA, b: uB });

    return out;
  }

  /* ---------- Income & Expenditure comparison (only when the workbook has one) ---------- */
  function compareIncomeExpense(pa, pb) {
    if (!pa.incomeExpense || !pb.incomeExpense) return null;
    const map = ie => {
      const mm = new Map();
      ie.lines.forEach(l => {
        const k = `${l.side}|${P.normKey(l.name)}`;
        const prev = mm.get(k);
        if (prev) prev.amount += l.amount; else mm.set(k, { ...l });
      });
      return mm;
    };
    const ma = map(pa.incomeExpense), mb = map(pb.incomeExpense);
    const keys = new Set([...ma.keys(), ...mb.keys()]);
    const rows = [];
    keys.forEach(k => {
      const la = ma.get(k), lb = mb.get(k), ref = lb || la;
      const a = la ? la.amount : 0, b = lb ? lb.amount : 0;
      rows.push({ side: ref.side, group: ref.group, name: ref.name, a, b, diff: b - a, pct: la && lb ? pctChange(a, b) : null });
    });
    const tot = (side, which) => sum(rows.filter(r => r.side === side), r => r[which]);
    return {
      rows: rows.sort((x, y) => (x.side === y.side ? Math.abs(y.b) - Math.abs(x.b) : x.side === 'I' ? -1 : 1)),
      income: { a: tot('I', 'a'), b: tot('I', 'b') },
      expense: { a: tot('E', 'a'), b: tot('E', 'b') }
    };
  }

  const api = { compare, buildInsights, healthCheck, variations, compareIncomeExpense, fyInfo, pctChange, safeDiv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BSAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis);
