/* ==========================================================================
   Branch Balance Sheet Analysis — application
   Upload → parse (BSParser) → compare (BSAnalysis) → render (BSCharts + DOM)
   All visible text goes through BSI18N.t so the page works in English and Marathi.
   ========================================================================== */
(function () {
  'use strict';

  const { esc } = BSCharts;
  const $ = id => document.getElementById(id);
  const CATS = BSParser.CATEGORIES;
  const I18N = BSI18N;
  const T = (key, p) => I18N.t(key, p);

  /*************************************************************************
   * 1. STATE & SETTINGS (shared with the Daily MIS dashboard)
   *************************************************************************/
  const SETTINGS_KEY = 'mis-settings';
  const state = {
    files: { 1: null, 2: null },
    errors: { 1: null, 2: null },
    pairError: null,
    model: null,
    sort: {},
    depDonut: 'B',
    loanDonut: 'B'
  };

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { /* storage unavailable */ }
    return {
      raw: saved,
      lang: saved.lang === 'mr' ? 'mr' : 'en',
      // Own theme field: light like the other calculator tools, without touching the Daily MIS theme
      theme: saved.bsTheme === 'dark' ? 'dark' : 'light',
      units: ['crore', 'lakh', 'exact'].includes(saved.units) ? saved.units : 'lakh'
    };
  }
  const settings = loadSettings();

  function saveSettings() {
    const merged = { ...settings.raw, lang: settings.lang, bsTheme: settings.theme, units: settings.units };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)); } catch (e) { /* storage unavailable */ }
  }

  function markSegment(group, value) {
    document.querySelectorAll(`[data-setting="${group}"] button, #${group} button`).forEach(b => {
      b.classList.toggle('active', b.dataset.value === value);
      b.setAttribute('aria-pressed', b.dataset.value === value);
    });
  }

  function applyTheme(theme) {
    settings.theme = theme;
    document.documentElement.dataset.theme = theme;
    markSegment('theme', theme);
  }

  // Fill every element that carries a data-i18n* attribute
  function applyStaticText() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = T(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = T(el.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = T(el.dataset.i18nTitle); });
    document.title = T('app.docTitle');
  }

  function applyLang(lang) {
    settings.lang = lang;
    I18N.setLang(lang);
    document.documentElement.lang = lang;
    markSegment('lang', lang);
    applyStaticText();
  }

  /*************************************************************************
   * 2. FORMATTING
   *************************************************************************/
  const NF = {};
  const nf = dec => NF[dec] || (NF[dec] = new Intl.NumberFormat('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  const MINUS = '−';

  function fmtAmt(v) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    const sign = v < 0 ? MINUS : '';
    if (settings.units === 'crore') return `${sign}₹${nf(a > 0 && a < 1e5 ? 4 : 2).format(a / 1e7)} ${T('unit.cr')}`;
    if (settings.units === 'lakh') return `${sign}₹${nf(2).format(a / 1e5)} ${T('unit.l')}`;
    return `${sign}₹${nf(2).format(a)}`;
  }

  // Compact amounts for axes and chart labels
  function fmtAxis(v) {
    const a = Math.abs(v);
    const sign = v < 0 ? MINUS : '';
    const trim = n => nf(n >= 100 ? 0 : n >= 10 ? 1 : 2).format(n);
    if (settings.units === 'crore' || (settings.units === 'exact' && a >= 1e7)) return `${sign}${trim(a / 1e7)} ${T('unit.cr')}`;
    if (settings.units === 'lakh' || a >= 1e5) return `${sign}${trim(a / 1e5)} ${T('unit.l')}`;
    if (a >= 1e3) return `${sign}${trim(a / 1e3)} ${T('unit.k')}`;
    return `${sign}${nf(0).format(a)}`;
  }

  const fmtDelta = v => (v > 0 ? '+' : v < 0 ? MINUS : '') + fmtAmt(Math.abs(v));
  const fmtPct = (v, dec = 2) => (v == null || !isFinite(v) ? '—' : `${nf(dec).format(v)}%`);
  const fmtSignedPct = v => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? MINUS : ''}${nf(2).format(Math.abs(v))}%`);
  const fmtPP = v => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? MINUS : ''}${nf(2).format(Math.abs(v))} ${T('unit.pp')}`);
  const fmtDate = d => `${String(d.getDate()).padStart(2, '0')} ${I18N.months()[d.getMonth()]} ${d.getFullYear()}`;
  const fyLabel = fy => (I18N.lang === 'mr' ? `आ.व. ${fy.startYear}-${String(fy.startYear + 1).slice(2)}` : fy.label);
  const unitLabel = () => T(`units.label.${settings.units}`);
  const catName = id => I18N.catName(id);
  const head = name => I18N.head(name);
  const sideName = s => T(`sides.${s}`);

  // Account name in the current language, with the original Excel name underneath when translated
  function headCell(name, extra) {
    const sub = [I18N.hasHead(name) ? name : '', extra || ''].filter(Boolean).join(' · ');
    return `<span class="name">${esc(head(name))}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}`;
  }

  function deltaChip(diff, pct, opts = {}) {
    if (diff == null || !isFinite(diff)) return '';
    const dir = Math.abs(diff) < 0.005 ? 'flat' : diff > 0 ? 'up' : 'down';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•';
    const cls = `delta ${dir}${opts.inverse ? ' inverse' : ''}${opts.neutral ? ' neutral' : ''}`;
    const text = opts.text != null ? opts.text : `${fmtDelta(diff)}${pct != null && isFinite(pct) ? ` (${fmtSignedPct(pct)})` : ''}`;
    return `<span class="${cls}">${arrow} ${esc(text)}</span>`;
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // Heads where a rise is bad news (interest receivable mirrors unpaid loan interest)
  const INVERSE = new Set(['L_OIR', 'A_LOAN_UNS', 'A_INTREC', 'A_PL']);

  /*************************************************************************
   * 3. FILE HANDLING
   *************************************************************************/
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result));
      fr.onerror = () => reject(Object.assign(new Error('read'), { code: 'READ' }));
      fr.readAsArrayBuffer(file);
    });
  }

  function errorFor(file, err) {
    const f = file.name;
    if (err && err.code === 'READ') return { key: 'err.read', p: { f } };
    if (err && err.code) return { key: `err.${err.code}`, p: { f, ...err.params } };
    return { key: 'err.other', p: { f, msg: (err && err.message) || String(err) } };
  }

  async function handleFile(slot, file) {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      state.files[slot] = null;
      state.errors[slot] = { key: 'err.notExcel', p: { f: file.name } };
      refresh();
      return;
    }
    $(`slot-${slot}-desc`).textContent = T('slot.reading', { f: file.name });
    try {
      const data = await readFile(file);
      state.files[slot] = BSParser.parseWorkbook(XLSX, data, file.name);
      state.errors[slot] = null;
    } catch (err) {
      state.files[slot] = null;
      state.errors[slot] = errorFor(file, err);
    }
    // Keep the older date in slot 1 (A) so changes always read old → new
    const f1 = state.files[1], f2 = state.files[2];
    if (f1 && f2 && f1.meta.date > f2.meta.date) {
      state.files[1] = f2;
      state.files[2] = f1;
      toast(T('toast.sorted'));
    }
    refresh();
  }

  function removeFile(slot) {
    state.files[slot] = null;
    state.errors[slot] = null;
    $(`file-${slot}`).value = '';
    refresh();
  }

  function bindSlot(slot) {
    const box = $(`slot-${slot}`);
    const input = $(`file-${slot}`);
    box.addEventListener('click', e => {
      if (e.target.closest('.slot-remove')) return;
      input.click();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', () => { handleFile(slot, input.files[0]); input.value = ''; });
    $(`slot-${slot}-remove`).addEventListener('click', e => { e.stopPropagation(); removeFile(slot); });
    ['dragenter', 'dragover'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.remove('dragover'); }));
    box.addEventListener('drop', e => {
      const files = [...(e.dataTransfer.files || [])];
      if (!files.length) return;
      if (files.length > 1) {
        // Two files dropped together: fill both slots
        handleFile(1, files[0]).then(() => handleFile(2, files[1]));
      } else {
        handleFile(slot, files[0]);
      }
    });
  }

  function renderSlot(slot) {
    const f = state.files[slot];
    const err = state.errors[slot];
    const box = $(`slot-${slot}`);
    box.classList.toggle('loaded', !!f);
    box.classList.toggle('error', !!err);
    box.setAttribute('aria-label', T(`slot.${slot}.title`));
    $(`slot-${slot}-remove`).hidden = !f && !err;
    const meta = $(`slot-${slot}-meta`);
    if (f) {
      const ok = f.checks.every(c => c.ok);
      $(`slot-${slot}-title`).textContent = f.meta.branch + (f.meta.branchCode ? ` (${T('slot.code', { c: f.meta.branchCode })})` : '');
      $(`slot-${slot}-desc`).textContent = T('slot.replace', { file: f.fileName, sheet: f.sheetName });
      meta.innerHTML =
        `<span class="chip">${esc(T('slot.asOn', { d: fmtDate(f.meta.date) }))}</span>` +
        `<span class="chip ${ok ? 'chip-ok' : 'chip-bad'}">${esc(T(ok ? 'slot.tally' : 'slot.mismatch'))}</span>` +
        (f.meta.dateSource === 'file name' ? `<span class="chip chip-warn">${esc(T('slot.dateFromName'))}</span>` : '');
    } else {
      $(`slot-${slot}-title`).textContent = T(`slot.${slot}.title`);
      $(`slot-${slot}-desc`).textContent = err ? T(err.key, err.p) : T(`slot.${slot}.desc`);
      meta.innerHTML = '';
    }
  }

  function pairProblem(a, b) {
    const same = (a.meta.branchCode && b.meta.branchCode)
      ? a.meta.branchCode === b.meta.branchCode
      : BSParser.normKey(a.meta.branch) === BSParser.normKey(b.meta.branch);
    if (!same) return { key: 'err.diffBranch', p: { a: a.meta.branch, b: b.meta.branch } };
    if (a.meta.date.getTime() === b.meta.date.getTime()) return { key: 'err.sameDate', p: { d: fmtDate(a.meta.date) } };
    return null;
  }

  function refresh() {
    renderSlot(1);
    renderSlot(2);
    const a = state.files[1], b = state.files[2];
    const problem = a && b ? pairProblem(a, b) : null;
    const alert = $('alert');
    alert.hidden = !problem;
    alert.textContent = problem ? `⚠️ ${T(problem.key, problem.p)}` : '';

    state.model = a && b && !problem ? BSAnalysis.compare(a, b) : null;
    $('btn-clear').disabled = !a && !b && !state.errors[1] && !state.errors[2];
    $('btn-print').disabled = !state.model;
    $('upload-row').hidden = !!state.model;
    $('brand-title').hidden = !!state.model;
    $('branch-id').hidden = !state.model;
    $('period-range').hidden = !state.model;
    $('empty').hidden = !!state.model;
    $('dash').hidden = !state.model;
    if (state.model) renderAll();
  }

  /*************************************************************************
   * 4. GENERIC TABLE (sortable, optional group rows and footer)
   *************************************************************************/
  const tables = {};

  function renderTable(id, cfg) {
    tables[id] = cfg;
    const el = $(id);
    const st = state.sort[id] || cfg.defaultSort || null;
    const rows = cfg.rows.slice();
    if (st) {
      const col = cfg.columns.find(c => c.key === st.key);
      if (col) {
        const val = col.sort || (r => r[col.key]);
        rows.sort((x, y) => {
          const vx = val(x), vy = val(y);
          if (vx == null && vy == null) return 0;
          if (vx == null) return 1;
          if (vy == null) return -1;
          const cmp = typeof vx === 'string' ? vx.localeCompare(vy) : vx - vy;
          return st.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    let html = '<table><thead><tr>';
    cfg.columns.forEach(c => {
      const sorted = st && st.key === c.key;
      const cls = [c.cls || '', c.nosort ? '' : 'sortable', sorted ? `sorted ${st.dir}` : ''].join(' ').trim();
      html += `<th class="${cls}" data-key="${c.key}"${c.title ? ` title="${esc(c.title)}"` : ''}>${esc(c.label)}</th>`;
    });
    html += '</tr></thead><tbody>';
    if (!rows.length) {
      html += `<tr class="empty-row"><td colspan="${cfg.columns.length}">${esc(cfg.empty || T('tbl.empty'))}</td></tr>`;
    } else if (cfg.groupBy) {
      const groups = [];
      rows.forEach(r => {
        const g = cfg.groupBy(r);
        let grp = groups.find(x => x.key === g);
        if (!grp) groups.push(grp = { key: g, rows: [] });
        grp.rows.push(r);
      });
      if (cfg.groupOrder) groups.sort((x, y) => cfg.groupOrder.indexOf(x.key) - cfg.groupOrder.indexOf(y.key));
      groups.forEach(g => {
        html += `<tr class="group-row"><td colspan="${cfg.columns.length}">${esc(cfg.groupLabel ? cfg.groupLabel(g.key) : g.key)}</td></tr>`;
        g.rows.forEach(r => { html += rowHtml(cfg, r); });
        if (cfg.groupFooter) html += cfg.groupFooter(g);
      });
    } else {
      rows.forEach(r => { html += rowHtml(cfg, r); });
    }
    html += '</tbody>';
    if (cfg.footer) html += `<tfoot>${cfg.footer(rows)}</tfoot>`;
    html += '</table>';
    el.innerHTML = html;
    el.querySelectorAll('th.sortable').forEach(th => th.addEventListener('click', () => {
      const key = th.dataset.key;
      const cur = state.sort[id] || cfg.defaultSort;
      const dir = cur && cur.key === key && cur.dir === 'desc' ? 'asc' : 'desc';
      state.sort[id] = { key, dir };
      renderTable(id, tables[id]);
    }));
  }

  function rowHtml(cfg, r) {
    return '<tr>' + cfg.columns.map(c => `<td class="${c.cls || ''}">${c.html ? c.html(r) : esc(r[c.key])}</td>`).join('') + '</tr>';
  }

  // Column builders reused by several tables
  const colAmt = (key, label) => ({ key, label, cls: 'r', html: r => fmtAmt(r[key]) });
  const colDiff = () => ({ key: 'diff', label: T('col.change'), cls: 'r', html: r => `<span class="${r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : 'muted'}">${fmtDelta(r.diff)}</span>` });
  const colPct = () => ({ key: 'pct', label: T('col.changePct'), cls: 'r', html: r => (r.pct == null ? '<span class="muted">—</span>' : `<span class="${r.pct > 0 ? 'pos' : r.pct < 0 ? 'neg' : 'muted'}">${fmtSignedPct(r.pct)}</span>`) });
  const statusText = s => T(`status.${s}`);
  const colStatus = () => ({ key: 'status', label: T('col.status'), cls: 'c', html: r => `<span class="status ${r.status}">${esc(statusText(r.status))}</span>` });
  const colsAB = m => [colAmt('a', fmtDate(m.A.meta.date)), colAmt('b', fmtDate(m.B.meta.date))];
  const sumOf = (rows, k) => rows.reduce((s, r) => s + r[k], 0);

  function footCells(label, a, b) {
    return `<td>${esc(label)}</td><td class="r">${fmtAmt(a)}</td><td class="r">${fmtAmt(b)}</td><td class="r">${fmtDelta(b - a)}</td><td class="r">${fmtSignedPct(BSAnalysis.pctChange(a, b))}</td>`;
  }

  /*************************************************************************
   * 5. RENDERING
   *************************************************************************/
  function kpiCard(o) {
    const pct = o.pct !== undefined ? o.pct : BSAnalysis.pctChange(o.a, o.b);
    const fmt = o.fmt || fmtAmt;
    const chip = o.chip !== undefined ? o.chip : deltaChip(o.b - o.a, pct, { inverse: o.inverse });
    return `<div class="kpi glass ${o.color || 'blue'}">
      <div class="kpi-label"${o.tip ? ` title="${esc(o.tip)}"` : ''}>${esc(o.label)}</div>
      <div class="kpi-value">${esc(fmt(o.b))}</div>
      <div class="kpi-foot">${chip}<span class="kpi-prev">${o.prev || esc(T('kpi.was', { v: fmt(o.a), d: fmtDate(state.model.A.meta.date) }))}</span></div>
    </div>`;
  }

  function ratioKpi(o) {
    const change = o.a != null && o.b != null ? (o.b - o.a) * 100 : null;
    const good = o.better === 'up' ? change > 0 : o.better === 'down' ? change < 0 : null;
    const chip = change == null ? '' :
      `<span class="delta ${Math.abs(change) < 0.005 ? 'flat' : good ? 'up' : 'down'}${o.better === 'neutral' ? ' neutral' : ''}">${change >= 0 ? '▲' : '▼'} ${esc(fmtPP(change))}</span>`;
    return kpiCard({ ...o, a: o.a == null ? null : o.a * 100, b: o.b == null ? null : o.b * 100, fmt: v => fmtPct(v), chip });
  }

  function renderAll() {
    const m = state.model;
    renderHeader(m);
    renderOverview(m);
    renderDeposits(m);
    renderLoans(m);
    renderLiquidity(m);
    renderFunds(m, 'L', 'ch-liab-mix', 'tbl-sources');
    renderFunds(m, 'A', 'ch-asset-mix', 'tbl-uses');
    renderVariations();
    initLineFilters(m);
    renderLines();
    renderIncome(m);
    renderAudit(m);
  }

  function renderHeader(m) {
    $('branch-name').textContent = m.branch;
    $('branch-code').textContent = m.branchCode ? T('slot.code', { c: m.branchCode }) : '';
    $('branch-code').hidden = !m.branchCode;
    $('period-a').textContent = fmtDate(m.A.meta.date);
    $('period-b').textContent = fmtDate(m.B.meta.date);
    $('period-a-fy').textContent = fyLabel(m.ga.fy);
    $('period-b-fy').textContent = fyLabel(m.gb.fy);
    $('period-gap').textContent = T('strip.days', { n: m.days });
    // FY is hidden on narrow screens, so keep it on hover too
    document.querySelector('.period.pa').title = fyLabel(m.ga.fy);
    document.querySelector('.period.pb').title = fyLabel(m.gb.fy);
  }

  function storyLines(m) {
    const { ga, gb } = m;
    const B = v => `<b>${esc(v)}</b>`;
    const dirWord = (v, up, down) => `<span class="${v >= 0 ? 'up' : 'down'}">${esc(T(v >= 0 ? up : down))}</span>`;
    const dA = fmtDate(m.A.meta.date), dB = fmtDate(m.B.meta.date);
    const lines = [];
    lines.push(T('story.total', { dB, dA, a: B(fmtAmt(ga.total)), b: B(fmtAmt(gb.total)), d: B(fmtAmt(Math.abs(gb.total - ga.total))), dir: dirWord(gb.total - ga.total, 'word.higher', 'word.lower') }));
    lines.push(T('story.deposits', { dA, b: B(fmtAmt(gb.deposits)), d: B(fmtAmt(Math.abs(gb.deposits - ga.deposits))), p: fmtPct(Math.abs(BSAnalysis.pctChange(ga.deposits, gb.deposits) || 0)), dir: dirWord(gb.deposits - ga.deposits, 'word.more', 'word.less') }));
    lines.push(T('story.loans', { b: B(fmtAmt(gb.loans)), d: B(fmtAmt(Math.abs(gb.loans - ga.loans))), p: fmtPct(Math.abs(BSAnalysis.pctChange(ga.loans, gb.loans) || 0)), dir: dirWord(gb.loans - ga.loans, 'word.more', 'word.less') }));
    if (gb.deposits) lines.push(T('story.cd', { n: B((gb.loans / gb.deposits * 100).toFixed(0)) }));
    if (gb.hoNet > 0) lines.push(T('story.ho', { ho: B(fmtAmt(gb.hoNet)), p: B(fmtPct(gb.hoNet / gb.total * 100)) }));
    else if (gb.hoNet < 0) lines.push(T('story.hoNeg', { ho: B(fmtAmt(-gb.hoNet)) }));
    lines.push(T('story.cash', { cash: B(fmtAmt(gb.cash)), bank: B(fmtAmt(gb.bank + gb.investments)) }));
    lines.push(T(gb.profit >= 0 ? 'story.profit' : 'story.loss', { fy: fyLabel(gb.fy), p: B(fmtAmt(Math.abs(gb.profit))), n: gb.fy.elapsed }));
    if (gb.oir > 0) lines.push(T('story.oir', { oir: B(fmtAmt(gb.oir)) }));
    return lines;
  }

  /* ----- Summary ----- */
  function profitCard(m) {
    const { ga, gb } = m;
    let chip;
    if (m.sameFY) {
      chip = deltaChip(gb.profit - ga.profit, BSAnalysis.pctChange(ga.profit, gb.profit));
    } else {
      const rate = BSAnalysis.pctChange(ga.profitAnnualised, gb.profitAnnualised);
      chip = deltaChip(gb.profitAnnualised - ga.profitAnnualised, rate, { text: T('kpi.profit.rate', { p: fmtSignedPct(rate) }) });
    }
    return kpiCard({
      label: T('kpi.profit', { fy: fyLabel(gb.fy) }), a: ga.profit, b: gb.profit, color: 'green', chip, tip: T('kpi.profit.tip'),
      prev: esc(`${fyLabel(ga.fy)}: ${fmtAmt(ga.profit)}`)
    });
  }

  function renderOverview(m) {
    const { ga, gb } = m;
    $('kpi-overview').innerHTML = [
      kpiCard({ label: T('kpi.size'), a: ga.total, b: gb.total, color: 'blue', tip: T('kpi.size.tip') }),
      kpiCard({ label: T('kpi.deposits'), a: ga.deposits, b: gb.deposits, color: 'amber', tip: T('kpi.deposits.tip') }),
      kpiCard({ label: T('kpi.loans'), a: ga.loans, b: gb.loans, color: 'violet', tip: T('kpi.loans.tip') }),
      kpiCard({ label: T('kpi.business'), a: ga.business, b: gb.business, color: 'cyan', tip: T('kpi.business.tip') }),
      profitCard(m),
      kpiCard({ label: T('kpi.oir'), a: ga.oir, b: gb.oir, color: 'red', inverse: true, tip: T('kpi.oir.tip') }),
      kpiCard({ label: T('kpi.ho'), a: ga.hoNet, b: gb.hoNet, color: 'amber', tip: T('kpi.ho.tip') })
    ].join('');


    renderTable('tbl-heads', {
      rows: m.cats.map(c => ({ ...c, name: catName(c.id), shareB: c.b / (c.side === 'L' ? gb.totalL : gb.total) })),
      groupBy: r => r.side,
      groupOrder: ['L', 'A'],
      groupLabel: sideName,
      groupFooter: g => {
        const ta = g.key === 'L' ? ga.totalL : ga.total, tb = g.key === 'L' ? gb.totalL : gb.total;
        return `<tr style="font-weight:750">${footCells(T('tbl.total', { s: sideName(g.key) }), ta, tb)}<td class="r">100.00%</td></tr>`;
      },
      columns: headColumns(m)
    });
  }

  const headColumns = m => [
    { key: 'name', label: T('col.head'), html: r => `<span class="name"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:7px;background:${catColor(r.id)}"></i>${esc(r.name)}</span>` },
    ...colsAB(m), colDiff(), colPct(),
    { key: 'shareB', label: T('col.shareB'), cls: 'r', html: r => fmtPct(r.shareB * 100) }
  ];

  /* ----- Sources / use of funds (one side of the balance sheet each) ----- */
  function renderFunds(m, side, chartId, tableId) {
    const cats = m.cats.filter(c => c.side === side);
    BSCharts.stacked100($(chartId), {
      fmt: fmtAmt,
      legend: cats.map(c => ({ label: catName(c.id), color: catColor(c.id) })),
      columns: [
        { label: fmtDate(m.A.meta.date), segments: cats.map(c => ({ label: catName(c.id), value: c.a, color: catColor(c.id) })) },
        { label: fmtDate(m.B.meta.date), segments: cats.map(c => ({ label: catName(c.id), value: c.b, color: catColor(c.id) })) }
      ]
    });
    const ta = side === 'L' ? m.ga.totalL : m.ga.total, tb = side === 'L' ? m.gb.totalL : m.gb.total;
    renderTable(tableId, {
      rows: cats.filter(c => c.a || c.b).map(c => ({ ...c, name: catName(c.id), shareB: c.b / tb })),
      defaultSort: { key: 'b', dir: 'desc' },
      columns: headColumns(m),
      footer: () => `<tr>${footCells(T('tbl.total', { s: sideName(side) }), ta, tb)}<td class="r">100.00%</td></tr>`
    });
  }

  const CAT_ORDER = Object.keys(CATS);
  function catColor(id) {
    // One distinct colour per head within each side
    const fixed = {
      L_CAP: '#0ea5e9', L_RES: '#14b8a6', L_DEP_SAV: '#3b82f6', L_DEP_TERM: '#f59e0b', L_BORR: '#a855f7',
      L_INTPAY: '#8b5cf6', L_OIR: '#f43f5e', L_STAT: '#84cc16', L_OTH: '#ec4899', L_HO: '#64748b', L_PL: '#10b981',
      A_CASH: '#10b981', A_BANK: '#06b6d4', A_INV: '#84cc16', A_SEC: '#eab308', A_LOAN_SEC: '#8b5cf6',
      A_LOAN_UNS: '#ec4899', A_FIX: '#0ea5e9', A_INTREC: '#f97316', A_OTH: '#a3a3a3', A_HO: '#64748b', A_PL: '#e11d48'
    };
    return fixed[id] || '#94a3b8';
  }

  /* ----- Deposits / loans ----- */
  const donutSlots = rows => (rows.length > 8 ? 7 : rows.length);

  function donutFor(elId, rows, period, centerKey) {
    const key = period === 'A' ? 'a' : 'b';
    const sorted = rows.filter(r => r[key] > 0).sort((x, y) => y[key] - x[key]);
    // Eight colour slots: the seven largest plus "Others"
    const top = sorted.slice(0, donutSlots(sorted));
    const rest = sorted.slice(top.length);
    const segs = top.map((r, i) => ({ label: head(r.name), value: r[key], color: BSCharts.PALETTE[i] }));
    if (rest.length) segs.push({ label: T('donut.others', { n: rest.length }), value: rest.reduce((s, r) => s + r[key], 0), color: BSCharts.COLOR_OTHER });
    BSCharts.donut($(elId), { segments: segs, centerLabel: T(centerKey), fmt: fmtAmt, fmtShort: fmtAxis });
  }

  function productBars(elId, rows) {
    const items = rows.filter(r => r.a || r.b).sort((x, y) => y.b - x.b || y.a - x.a)
      .map(r => ({ label: head(r.name), a: r.a, b: r.b }));
    BSCharts.groupedBars($(elId), {
      items, fmt: fmtAmt, fmtAxis, fmtDelta,
      labelA: fmtDate(state.model.A.meta.date), labelB: fmtDate(state.model.B.meta.date)
    });
  }

  function productTable(id, rows, nameLabel, totalLabel, ta, tb) {
    const m = state.model;
    renderTable(id, {
      rows,
      defaultSort: { key: 'b', dir: 'desc' },
      columns: [
        { key: 'name', label: nameLabel, html: r => headCell(r.name, catName(r.category)) },
        ...colsAB(m), colDiff(), colPct(),
        colStatus()
      ],
      footer: () => `<tr>${footCells(totalLabel, ta, tb)}<td></td></tr>`
    });
  }

  function renderDeposits(m) {
    const { ga, gb } = m;
    const casa = m.ratios.find(r => r.id === 'casa');
    $('kpi-deposits').innerHTML = [
      kpiCard({ label: T('kpi.deposits'), a: ga.deposits, b: gb.deposits, color: 'amber', tip: T('kpi.deposits.tip') }),
      kpiCard({ label: T('kpi.savings'), a: ga.savings, b: gb.savings, color: 'blue', tip: I18N.catWhat('L_DEP_SAV') }),
      kpiCard({ label: T('kpi.term'), a: ga.term, b: gb.term, color: 'violet', tip: I18N.catWhat('L_DEP_TERM') }),
      ratioKpi({ label: T('kpi.casa'), a: casa.a, b: casa.b, better: 'up', color: 'green', tip: I18N.ratioExplain('casa') })
    ].join('');
    productBars('ch-dep-bars', m.deposits);
    donutFor('ch-dep-donut', m.deposits, state.depDonut, 'donut.deposits');
    markSegment('dep-donut-period', state.depDonut);
    productTable('tbl-deposits', m.deposits, T('col.scheme'), T('tbl.totalDep'), ga.deposits, gb.deposits);
  }

  function renderLoans(m) {
    const { ga, gb } = m;
    const share = v => fmtPct(BSAnalysis.safeDiv(v, gb.loans) * 100);
    $('kpi-loans').innerHTML = [
      kpiCard({ label: T('kpi.loans'), a: ga.loans, b: gb.loans, color: 'violet', tip: T('kpi.loans.tip') }),
      kpiCard({ label: T('kpi.secured'), a: ga.securedLoans, b: gb.securedLoans, color: 'green', tip: I18N.catWhat('A_LOAN_SEC') }),
      kpiCard({ label: T('kpi.unsecured'), a: ga.unsecuredLoans, b: gb.unsecuredLoans, color: 'red', inverse: true, tip: I18N.catWhat('A_LOAN_UNS') }),
      kpiCard({ label: T('kpi.gold'), a: ga.goldLoans, b: gb.goldLoans, color: 'amber', tip: I18N.ratioExplain('gold') })
    ].join('');
    productBars('ch-loan-bars', m.loans);
    donutFor('ch-loan-donut', m.loans, state.loanDonut, 'donut.loans');
    markSegment('loan-donut-period', state.loanDonut);
    productTable('tbl-loans', m.loans, T('col.product'), T('tbl.totalLoans'), ga.loans, gb.loans);
  }

  /* ----- Cash & funds ----- */
  function renderLiquidity(m) {
    const { ga, gb } = m;
    $('kpi-liquidity').innerHTML = [
      kpiCard({ label: T('kpi.cash'), a: ga.cash, b: gb.cash, color: 'green', tip: I18N.catWhat('A_CASH') }),
      kpiCard({ label: T('kpi.bank'), a: ga.bank, b: gb.bank, color: 'cyan', tip: I18N.catWhat('A_BANK') }),
      kpiCard({ label: T('kpi.inv'), a: ga.investments, b: gb.investments, color: 'blue', tip: I18N.catWhat('A_INV') }),
      kpiCard({ label: T('kpi.ho'), a: ga.hoNet, b: gb.hoNet, color: 'amber', tip: T('kpi.ho.tip') })
    ].join('');

    const seg = g => [
      { label: T('seg.loans'), value: g.loans, color: '#8b5cf6' },
      { label: T('seg.ho'), value: Math.max(g.hoAsset, 0), color: '#64748b' },
      { label: T('seg.liquid'), value: g.liquid, color: '#06b6d4' },
      { label: T('seg.other'), value: g.total - g.loans - Math.max(g.hoAsset, 0) - g.liquid, color: '#f97316' }
    ];
    BSCharts.stacked100($('ch-deploy'), {
      fmt: fmtAmt,
      legend: seg(ga).map(s => ({ label: s.label, color: s.color })),
      columns: [{ label: fmtDate(m.A.meta.date), segments: seg(ga) }, { label: fmtDate(m.B.meta.date), segments: seg(gb) }]
    });

    const nameCol = { key: 'name', label: T('col.account'), html: r => headCell(r.name) };
    renderTable('tbl-liquid', {
      rows: m.rows.filter(r => r.family === 'liquid'),
      columns: [nameCol, ...colsAB(m), colDiff(), colPct(), colStatus()],
      groupBy: r => r.category,
      groupLabel: catName,
      footer: rows => `<tr>${footCells(T('tbl.totalLiquid'), sumOf(rows, 'a'), sumOf(rows, 'b'))}<td></td></tr>`
    });
    renderTable('tbl-other', {
      rows: m.rows.filter(r => !['liquid', 'deposits', 'loans'].includes(r.family)),
      columns: [nameCol, { key: 'side', label: T('col.side'), html: r => esc(T(`side.${r.side}`)) }, ...colsAB(m), colDiff(), colPct(), colStatus()],
      groupBy: r => r.category,
      groupOrder: CAT_ORDER,
      groupLabel: catName,
      empty: T('tbl.noOther')
    });
  }

  /* ----- Big changes ----- */
  function variationOpts() {
    const pct = Math.max(0, parseFloat($('var-pct').value) || 0);
    const lakh = Math.max(0, parseFloat($('var-amt').value) || 0);
    return { pct, minAmount: lakh * 1e5 };
  }

  function renderVariations() {
    const m = state.model;
    if (!m) return;
    renderTable('tbl-variations', {
      rows: BSAnalysis.variations(m, variationOpts()).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)),
      empty: T('var.empty'),
      columns: [
        { key: 'name', label: T('col.account'), html: r => headCell(r.name, `${T(`side.${r.side}`)} · ${catName(r.category)}`) },
        ...colsAB(m), colDiff(), colPct(),
        colStatus()
      ]
    });
    const movers = m.rows.filter(r => r.family !== 'ho' && r.family !== 'pl' && Math.abs(r.diff) > 0.5)
      .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)).slice(0, 15)
      .sort((x, y) => y.diff - x.diff);
    BSCharts.diverging($('ch-movers'), {
      items: movers.map(r => ({
        label: head(r.name), value: r.diff,
        tipRows: [`${fmtDate(m.A.meta.date)}: ${fmtAmt(r.a)}`, `${fmtDate(m.B.meta.date)}: ${fmtAmt(r.b)}`, `${T('col.change')}: ${fmtDelta(r.diff)} (${fmtSignedPct(r.pct)})`]
      })),
      fmtAxis
    });
  }

  /* ----- All heads ----- */
  function initLineFilters(m) {
    const sel = $('line-cat');
    const cur = sel.value;
    const used = CAT_ORDER.filter(k => m.rows.some(r => r.category === k));
    sel.innerHTML = `<option value="">${esc(T('lines.allHeads'))}</option>` +
      used.map(k => `<option value="${k}">${esc(T(`side.${CATS[k].side}`))} · ${esc(catName(k))}</option>`).join('');
    if (used.includes(cur)) sel.value = cur;
  }

  function filteredLines() {
    const m = state.model;
    const q = $('line-search').value.trim().toLowerCase();
    const side = $('line-side').value;
    const cat = $('line-cat').value;
    const status = $('line-status').value;
    return m.rows.filter(r =>
      (!side || r.side === side) &&
      (!cat || r.category === cat) &&
      (!status || r.status === status) &&
      (!q || [r.name, head(r.name), r.group, catName(r.category)].some(s => s.toLowerCase().includes(q))));
  }

  function renderLines() {
    const m = state.model;
    if (!m) return;
    const side = $('line-side').value;
    renderTable('tbl-lines', {
      rows: filteredLines(),
      empty: T('lines.empty'),
      columns: [
        { key: 'side', label: T('col.side'), html: r => esc(T(`side.${r.side}`)) },
        { key: 'name', label: T('col.account'), html: r => headCell(r.name, T('col.group', { g: r.group })) },
        { key: 'category', label: T('col.mainHead'), sort: r => catName(r.category), html: r => esc(catName(r.category)) },
        ...colsAB(m), colDiff(), colPct(), colStatus()
      ],
      footer: list => {
        const mixed = !side && list.some(r => r.side === 'L') && list.some(r => r.side === 'A');
        if (mixed) return `<tr><td colspan="8" class="muted">${esc(T('lines.mixed', { n: list.length }))}</td></tr>`;
        return `<tr><td colspan="2">${esc(T('lines.count', { n: list.length }))}</td>${footCells('', sumOf(list, 'a'), sumOf(list, 'b'))}<td></td></tr>`;
      }
    });
  }

  /* ----- Income & expenses (only when present in both workbooks) ----- */
  function renderIncome(m) {
    const ie = BSAnalysis.compareIncomeExpense(m.A, m.B);
    $('tab-income').hidden = !ie;
    if (!ie) {
      if ($('v-income').classList.contains('active')) switchView('v-overview');
      return;
    }
    $('kpi-income').innerHTML = [
      kpiCard({ label: T('kpi.income'), a: ie.income.a, b: ie.income.b, color: 'green' }),
      kpiCard({ label: T('kpi.expense'), a: ie.expense.a, b: ie.expense.b, color: 'red', inverse: true }),
      kpiCard({ label: T('kpi.surplus'), a: ie.income.a - ie.expense.a, b: ie.income.b - ie.expense.b, color: 'blue' }),
      ratioKpi({ label: T('kpi.expRatio'), a: BSAnalysis.safeDiv(ie.expense.a, ie.income.a), b: BSAnalysis.safeDiv(ie.expense.b, ie.income.b), better: 'down', color: 'amber' })
    ].join('');
    renderTable('tbl-income', {
      rows: ie.rows.map(r => ({ ...r, status: r.a === 0 && r.b ? 'new' : r.b === 0 && r.a ? 'closed' : r.diff > 0 ? 'up' : r.diff < 0 ? 'down' : 'flat' })),
      groupBy: r => r.side,
      groupOrder: ['I', 'E'],
      groupLabel: k => T(k === 'I' ? 'inc.income' : 'inc.expense'),
      columns: [
        { key: 'name', label: T('col.account'), html: r => headCell(r.name, r.group) },
        ...colsAB(m), colDiff(), colPct(), colStatus()
      ]
    });
  }

  /* ----- Totals check (printed report) ----- */
  function checkLabel(c) {
    const p = { side: c.side ? sideName(c.side) : '', n: c.count };
    return T(`chk.${c.code}`, p);
  }

  /* ----- Audit & overview ----- */
  function renderAudit(m) {
    const { ga, gb } = m;
    const rows = [
      ['total', ga.total, gb.total],
      ['deposits', ga.deposits, gb.deposits],
      ['casa', ga.savings, gb.savings],
      ['loans', ga.loans, gb.loans],
      ['secured', ga.securedLoans, gb.securedLoans],
      ['unsecured', ga.unsecuredLoans, gb.unsecuredLoans],
      ['ho', ga.hoNet, gb.hoNet],
      ['liquid', ga.cash + ga.bank, gb.cash + gb.bank],
      ['profit', ga.profit, gb.profit]
    ];
    $('tbl-audit').innerHTML = `<table><thead><tr>
        <th>${esc(T('audit.col.param'))}</th><th class="r">${esc(fmtDate(m.A.meta.date))}</th><th class="r">${esc(fmtDate(m.B.meta.date))}</th>
        <th class="r">${esc(T('audit.col.var'))}</th><th class="r">${esc(T('audit.col.pct'))}</th></tr></thead><tbody>` +
      rows.map(([id, a, b]) => `<tr><td class="name">${esc(T(`audit.r.${id}`))}</td><td class="r">${fmtAmt(a)}</td><td class="r">${fmtAmt(b)}</td>` +
        `<td class="r">${fmtDelta(b - a)}</td><td class="r">${fmtSignedPct(BSAnalysis.pctChange(a, b))}</td></tr>`).join('') +
      '</tbody></table>';
  }

  /*************************************************************************
   * 6. CSV DOWNLOAD (line items, as filtered)
   *************************************************************************/
  function fileStem() {
    const m = state.model;
    const d = x => `${String(x.getDate()).padStart(2, '0')}${String(x.getMonth() + 1).padStart(2, '0')}${x.getFullYear()}`;
    return `BS_Analysis_${m.branch.replace(/[^A-Za-z0-9]+/g, '_')}_${d(m.A.meta.date)}_vs_${d(m.B.meta.date)}`;
  }

  function exportLinesCsv() {
    const m = state.model;
    if (!m) return;
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const headRow = [T('col.side'), T('col.mainHead'), T('col.group', { g: '' }).replace(/[:\s]+$/, ''), T('col.account'), fmtDate(m.A.meta.date), fmtDate(m.B.meta.date), T('col.change'), T('col.changePct'), T('col.status')];
    const lines = [headRow.map(q).join(',')].concat(filteredLines().map(r => [
      T(`side.${r.side}`), catName(r.category), r.group, r.name,
      r.a.toFixed(2), r.b.toFixed(2), r.diff.toFixed(2), r.pct == null ? '' : r.pct.toFixed(2), statusText(r.status)
    ].map(q).join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileStem()}_accounts.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /*************************************************************************
   * 7. PRINTABLE REPORT (in the selected language)
   *************************************************************************/
  function rpTable(headCols, body, foot) {
    return `<table><thead><tr>${headCols.map(h => `<th class="${h.r ? 'r' : ''}">${esc(h.t)}</th>`).join('')}</tr></thead>` +
      `<tbody>${body}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table>`;
  }

  function rpRows(rows, cols) {
    return rows.map(r => `<tr>${cols.map(c => `<td class="${c.r ? 'r' : ''}">${c.v(r)}</td>`).join('')}</tr>`).join('');
  }

  function buildReport() {
    const m = state.model;
    const el = $('print-report');
    if (!m) { el.innerHTML = ''; document.body.classList.remove('has-report'); return; }
    const { ga, gb } = m;
    const dA = fmtDate(m.A.meta.date), dB = fmtDate(m.B.meta.date);
    const withCharts = true;
    const withProducts = true;
    const withAnnex = false;
    const remarks = '';
    const amtCols = [{ t: dA, r: 1 }, { t: dB, r: 1 }, { t: T('col.change'), r: 1 }, { t: T('col.changePct'), r: 1 }];
    const cmpCells = (a, b) => `<td class="r">${fmtAmt(a)}</td><td class="r">${fmtAmt(b)}</td><td class="r">${fmtDelta(b - a)}</td><td class="r">${fmtSignedPct(BSAnalysis.pctChange(a, b))}</td>`;
    let n = 1;
    const sec = (key, extraClass) => `<div class="rp-section${extraClass ? ` ${extraClass}` : ''}"><h2>${n++}. ${esc(T(key))}</h2>`;

    const key = [
      [T('kpi.size'), ga.total, gb.total], [T('kpi.deposits'), ga.deposits, gb.deposits],
      [T('key.savings'), ga.savings, gb.savings], [T('key.term'), ga.term, gb.term],
      [T('kpi.loans'), ga.loans, gb.loans], [T('key.secured'), ga.securedLoans, gb.securedLoans],
      [T('key.unsecured'), ga.unsecuredLoans, gb.unsecuredLoans], [T('kpi.business'), ga.business, gb.business],
      [T('key.liquid'), ga.liquid, gb.liquid], [T('kpi.ho'), ga.hoNet, gb.hoNet],
      [T('kpi.oir'), ga.oir, gb.oir], [T('key.profit'), ga.profit, gb.profit],
      [T('key.profitAnn'), ga.profitAnnualised, gb.profitAnnualised]
    ];

    const prodTable = (rows, ta, tb, title) => rpTable(
      [{ t: title }, ...amtCols],
      rpRows(rows.filter(r => r.a || r.b).sort((x, y) => y.b - x.b), [
        { v: r => esc(head(r.name)) }, { r: 1, v: r => fmtAmt(r.a) }, { r: 1, v: r => fmtAmt(r.b) },
        { r: 1, v: r => fmtDelta(r.diff) }, { r: 1, v: r => fmtSignedPct(r.pct) }
      ]),
      `<tr><td>${esc(T('rp.total'))}</td>${cmpCells(ta, tb)}</tr>`
    );

    const opts = variationOpts();
    const vars = BSAnalysis.variations(m, opts);

    let html = `
      <div class="rp-head"><div>
        <h1>${esc(m.society || '')}</h1>
        <div class="rp-sub">${esc(T('rp.heading'))}</div>
      </div></div>
      <div class="rp-meta">
        <div><small>${esc(T('rp.branch'))}</small><b>${esc(m.branch)}${m.branchCode ? ` (${esc(m.branchCode)})` : ''}</b></div>
        <div><small>${esc(T('strip.base'))}</small><b>${dA}</b> · ${esc(fyLabel(ga.fy))}</div>
        <div><small>${esc(T('strip.current'))}</small><b>${dB}</b> · ${esc(fyLabel(gb.fy))}</div>
        <div><small>${esc(T('rp.amountsIn'))}</small><b>${esc(unitLabel())}</b> · ${esc(T('rp.daysApart', { n: m.days }))}</div>
      </div>
      ${sec('rp.s.story')}<ol class="rp-story">${storyLines(m).map(l => `<li>${l}</li>`).join('')}</ol></div>
      ${sec('rp.s.key')}${rpTable([{ t: T('rp.particulars') }, ...amtCols], key.map(([l, a, b]) => `<tr><td>${esc(l)}</td>${cmpCells(a, b)}</tr>`).join(''))}</div>
`;

    if (withCharts) {
      html += `${sec('rp.s.charts')}
        <div class="rp-cols"><div class="rp-chart"><h3>${esc(T('rp.ch.liab'))}</h3><div class="chart" id="rp-ch-l"></div></div>
        <div class="rp-chart"><h3>${esc(T('rp.ch.asset'))}</h3><div class="chart" id="rp-ch-a"></div></div></div></div>`;
    }

    html += `${sec('rp.s.heads', 'rp-break')}
      ${rpTable([{ t: T('col.head') }, ...amtCols],
        ['L', 'A'].map(side => `<tr class="group-row"><td colspan="5">${esc(sideName(side))}</td></tr>` +
          m.cats.filter(c => c.side === side).map(c => `<tr><td>${esc(catName(c.id))}</td>${cmpCells(c.a, c.b)}</tr>`).join('') +
          `<tr style="font-weight:700"><td>${esc(T('tbl.total', { s: sideName(side) }))}</td>${side === 'L' ? cmpCells(ga.totalL, gb.totalL) : cmpCells(ga.total, gb.total)}</tr>`).join(''))}
    </div>
    ${sec('rp.s.ratios')}
      ${rpTable([{ t: T('col.ratio') }, { t: dA, r: 1 }, { t: dB, r: 1 }, { t: T('col.change'), r: 1 }],
        rpRows(m.ratios, [{ v: r => esc(I18N.ratioLabel(r.id)) }, { r: 1, v: r => fmtPct(r.a == null ? null : r.a * 100) }, { r: 1, v: r => fmtPct(r.b == null ? null : r.b * 100) }, { r: 1, v: r => fmtPP(r.change) }]))}
    </div>`;

    if (withProducts) {
      html += `${sec('rp.s.dep')}${prodTable(m.deposits, ga.deposits, gb.deposits, T('col.scheme'))}</div>
        ${sec('rp.s.loans')}${prodTable(m.loans, ga.loans, gb.loans, T('col.product'))}</div>`;
    }
    html += `${sec('rp.s.var')}
      <p style="margin-bottom:4px;color:#475569">${esc(T('rp.var.note', { p: opts.pct, l: nf(2).format(opts.minAmount / 1e5), more: vars.length > 25 ? T('rp.var.top') : '' }))}</p>
      ${vars.length ? rpTable([{ t: T('col.account') }, ...amtCols, { t: T('rp.status') }],
        rpRows(vars.slice(0, 25), [{ v: r => esc(head(r.name)) }, { r: 1, v: r => fmtAmt(r.a) }, { r: 1, v: r => fmtAmt(r.b) }, { r: 1, v: r => fmtDelta(r.diff) }, { r: 1, v: r => fmtSignedPct(r.pct) }, { v: r => esc(statusText(r.status)) }])) : `<p>${esc(T('rp.var.none'))}</p>`}
    </div>
    ${sec('rp.s.checks')}
      ${[m.A, m.B].map(p => `<p><b>${esc(p.fileName)} (${fmtDate(p.meta.date)}):</b> ${p.checks.every(c => c.ok) ? esc(T('rp.chk.ok')) : esc(p.checks.filter(c => !c.ok).map(c => `${checkLabel(c)} — ${c.detail}`).join('; '))}</p>`).join('')}
    </div>
    ${sec('rp.s.remarks')}<div class="rp-remarks">${remarks ? esc(remarks) : '&nbsp;'}</div></div>
    <div class="rp-sign"><div>${esc(T('rp.sign1'))}</div><div>${esc(T('rp.sign2'))}</div><div>${esc(T('rp.sign3'))}</div></div>`;

    if (withAnnex) {
      html += `<div class="rp-section rp-break"><h2>${esc(T('rp.annex'))}</h2>
        ${rpTable([{ t: T('col.side') }, { t: T('col.account') }, ...amtCols],
          rpRows(m.rows, [{ v: r => esc(T(`side.${r.side}`)) }, { v: r => esc(head(r.name)) }, { r: 1, v: r => fmtAmt(r.a) }, { r: 1, v: r => fmtAmt(r.b) }, { r: 1, v: r => fmtDelta(r.diff) }, { r: 1, v: r => fmtSignedPct(r.pct) }]))}</div>`;
    }
    const now = new Date();
    html += `<div class="rp-foot">${esc(T('rp.footer', { d: `${fmtDate(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, a: m.A.fileName, b: m.B.fileName }))}</div>`;

    el.innerHTML = html;
    if (withCharts) {
      const cats = side => m.cats.filter(c => c.side === side);
      ['L', 'A'].forEach(side => BSCharts.stacked100($(side === 'L' ? 'rp-ch-l' : 'rp-ch-a'), {
        fmt: fmtAmt,
        legend: cats(side).map(c => ({ label: catName(c.id), color: catColor(c.id) })),
        columns: [
          { label: dA, segments: cats(side).map(c => ({ label: catName(c.id), value: c.a, color: catColor(c.id) })) },
          { label: dB, segments: cats(side).map(c => ({ label: catName(c.id), value: c.b, color: catColor(c.id) })) }
        ]
      }));
    }
    document.body.classList.add('has-report');
  }

  function printReport() {
    if (!state.model) return;
    buildReport();
    window.print();
  }

  /*************************************************************************
   * 8. VIEW SWITCHING & EVENTS
   *************************************************************************/
  function switchView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
    document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === id));
    // Charts in hidden tabs were drawn at a default width; redraw at the real width
    if (state.model) renderAll();
  }

  function bindSegment(id, handler) {
    $(id).querySelectorAll('button').forEach(b => b.addEventListener('click', () => handler(b.dataset.value)));
  }

  function init() {
    applyTheme(settings.theme);
    applyLang(settings.lang);
    markSegment('units', settings.units);
    BSCharts.bindTooltip();
    bindSlot(1);
    bindSlot(2);

    $('tabs').addEventListener('click', e => {
      const tab = e.target.closest('.tab');
      if (tab) switchView(tab.dataset.view);
    });

    document.querySelectorAll('[data-setting="lang"] button').forEach(b => b.addEventListener('click', () => {
      applyLang(b.dataset.value);
      saveSettings();
      refresh();
    }));

    // Settings popover
    const panel = $('settings-panel');
    const btn = $('btn-settings');
    const setOpen = open => { panel.hidden = !open; btn.setAttribute('aria-expanded', open); };
    btn.addEventListener('click', e => { e.stopPropagation(); setOpen(panel.hidden); });
    document.addEventListener('click', e => { if (!panel.hidden && !e.target.closest('.settings-wrap')) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
    panel.querySelectorAll('[data-setting="theme"] button').forEach(b => b.addEventListener('click', () => { applyTheme(b.dataset.value); saveSettings(); }));
    panel.querySelectorAll('[data-setting="units"] button').forEach(b => b.addEventListener('click', () => {
      settings.units = b.dataset.value;
      markSegment('units', settings.units);
      saveSettings();
      refresh();
    }));

    bindSegment('dep-donut-period', v => { state.depDonut = v; donutFor('ch-dep-donut', state.model.deposits, v, 'donut.deposits'); markSegment('dep-donut-period', v); });
    bindSegment('loan-donut-period', v => { state.loanDonut = v; donutFor('ch-loan-donut', state.model.loans, v, 'donut.loans'); markSegment('loan-donut-period', v); });

    ['var-pct', 'var-amt'].forEach(id => $(id).addEventListener('input', renderVariations));
    $('line-search').addEventListener('input', renderLines);
    ['line-side', 'line-cat', 'line-status'].forEach(id => $(id).addEventListener('change', renderLines));
    $('btn-line-csv').addEventListener('click', exportLinesCsv);

    $('btn-clear').addEventListener('click', () => { removeFile(1); removeFile(2); });
    $('btn-print').addEventListener('click', printReport);
    // Ctrl+P also prints the report rather than the screen
    window.addEventListener('beforeprint', buildReport);
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (state.model) renderAll(); }, 200);
    });

    refresh();
  }

  init();
})();
