/* ==========================================================================
   Branch Balance Sheet — lightweight SVG charts (no external libraries)
   Every chart writes an <svg> into its container. Hover text comes from
   data-tip attributes and is shown by one shared tooltip.
   Marks follow one spec: thin bars with a 4px rounded data-end, a 2px
   surface gap between touching marks, hairline grids, text in text colours.
   ========================================================================== */
(function (root) {
  'use strict';

  // Categorical order is fixed; anything past slot 8 folds into "Others"
  const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];
  const COLOR_OTHER = '#94a3b8';
  const COLOR_A = '#3b82f6';
  const COLOR_B = '#f59e0b';
  const COLOR_POS = '#10b981';
  const COLOR_NEG = '#f43f5e';
  const RADIUS = 4;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function truncate(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // "Nice" axis ticks covering [min, max]
  function ticks(min, max, count) {
    if (min === max) { max = min + 1; }
    const span = max - min;
    const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
    const err = (span / count) / step0;
    const step = step0 * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return out;
  }

  const tip = rows => esc(rows.join('\n'));
  const L = (key, p) => root.BSI18N.t(key, p);

  // Draw at the container's real width so labels stay at their true font size
  // (hidden containers report 0 and fall back to a standard width).
  function chartWidth(el) {
    return Math.max(el.clientWidth || 760, 300);
  }

  // Rough text width for an 11px UI font, used to decide whether a label fits
  const textW = (str, size = 11) => String(str).length * size * 0.58;

  // Horizontal bar: square at the baseline (x), rounded at the data end.
  // A negative width grows leftwards from the baseline.
  function hbar(x, y, w, h) {
    const left = w < 0;
    const len = Math.abs(w);
    const r = Math.min(RADIUS, len / 2, h / 2);
    if (len < 0.5) return '';
    if (!left) {
      return `M${x},${y}h${len - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(len - r)}z`;
    }
    return `M${x},${y}h${-(len - r)}a${r},${r} 0 0 0 ${-r},${r}v${h - 2 * r}a${r},${r} 0 0 0 ${r},${r}h${len - r}z`;
  }

  const legendHtml = items => `<div class="legend">${items.map(l => `<span><i style="background:${l.color}"></i>${esc(l.label)}</span>`).join('')}</div>`;

  /* ---------- Grouped horizontal bars: Period A vs Period B ---------- */
  function groupedBars(el, cfg) {
    const items = cfg.items;
    if (!items.length) { el.innerHTML = `<p class="muted">${esc(L('chart.noData'))}</p>`; return; }
    const W = chartWidth(el);
    const labelW = Math.min(cfg.labelWidth || 190, Math.round(W * 0.34));
    const right = 64, top = 20;
    const barH = 10, gap = 2, rowH = barH * 2 + gap + 14;
    const H = top + items.length * rowH;
    const max = Math.max(...items.map(i => Math.max(i.a, i.b, 0)));
    const t = ticks(0, max || 1, W < 560 ? 3 : 5);
    const xMax = t[t.length - 1];
    const x = v => labelW + (Math.max(v, 0) / xMax) * (W - labelW - right);
    const maxChars = Math.max(10, Math.floor((labelW - 12) / 6.4));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || 'Comparison chart')}">`;
    t.forEach(v => {
      s += `<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${top - 4}" y2="${H}"/>`;
      s += `<text class="axis-label" x="${x(v)}" y="${top - 9}" text-anchor="middle">${esc(cfg.fmtAxis(v))}</text>`;
    });
    s += `<line class="zero" x1="${labelW}" x2="${labelW}" y1="${top - 4}" y2="${H}"/>`;
    items.forEach((it, i) => {
      const y = top + i * rowH + 7;
      const tt = tip([it.label, `${cfg.labelA}: ${cfg.fmt(it.a)}`, `${cfg.labelB}: ${cfg.fmt(it.b)}`, `${L('chart.change')}: ${cfg.fmtDelta(it.b - it.a)}`]);
      s += `<g class="row" data-tip="${tt}">`;
      s += `<rect class="hit" x="0" y="${y - 7}" width="${W}" height="${rowH}"/>`;
      s += `<text class="cat-label" x="${labelW - 10}" y="${y + barH + 4}" text-anchor="end">${esc(truncate(it.label, maxChars))}</text>`;
      s += `<path class="bar" d="${hbar(labelW, y, x(it.a) - labelW, barH)}" fill="${COLOR_A}"/>`;
      s += `<path class="bar" d="${hbar(labelW, y + barH + gap, x(it.b) - labelW, barH)}" fill="${COLOR_B}"/>`;
      const pct = it.a ? ((it.b - it.a) / Math.abs(it.a)) * 100 : null;
      if (pct == null && !it.b) { s += '</g>'; return; }
      const up = pct == null || pct >= 0;
      const lbl = pct == null ? L('chart.new') : `${Math.abs(pct).toFixed(1)}%`;
      s += `<text class="delta-label" x="${Math.max(x(it.a), x(it.b)) + 7}" y="${y + barH + 4}">` +
        `<tspan style="fill:${up ? COLOR_POS : COLOR_NEG}">${up ? '▲' : '▼'}</tspan> ${esc(lbl)}</text>`;
      s += '</g>';
    });
    s += '</svg>';
    el.innerHTML = legendHtml([{ label: cfg.labelA, color: COLOR_A }, { label: cfg.labelB, color: COLOR_B }]) + s;
  }

  /* ---------- Composition: one 100% bar per date + share table ---------- */
  function stacked100(el, cfg) {
    const cols = cfg.columns;
    const W = chartWidth(el);
    const barH = 30, rowH = 64, top = 4;
    const H = top + cols.length * rowH - 8;
    const totals = cols.map(col => col.segments.reduce((t, g) => t + Math.max(g.value, 0), 0) || 1);
    const clipBase = `clip${Math.random().toString(36).slice(2, 8)}`;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || 'Composition')}">`;
    cols.forEach((col, ci) => {
      const total = totals[ci];
      const y0 = top + ci * rowH;
      const by = y0 + 20;
      s += `<text class="col-label" x="0" y="${y0 + 11}">${esc(col.label)}</text>`;
      s += `<text class="axis-label" x="${W}" y="${y0 + 11}" text-anchor="end">${esc(cfg.fmt(total))}</text>`;
      s += `<clipPath id="${clipBase}${ci}"><rect x="0" y="${by}" width="${W}" height="${barH}" rx="6"/></clipPath>`;
      s += `<g clip-path="url(#${clipBase}${ci})">`;
      let x = 0;
      const segs = col.segments.filter(g => g.value > 0);
      segs.forEach((seg, si) => {
        const share = seg.value / total;
        const w = share * W;
        const last = si === segs.length - 1;
        const drawW = Math.max(w - (last ? 0 : 2), 0.5);
        const tt = tip([seg.label, `${col.label}: ${cfg.fmt(seg.value)}`, L('chart.ofTotal', { p: `${(share * 100).toFixed(2)}%` })]);
        s += `<rect class="seg" data-tip="${tt}" x="${x}" y="${by}" width="${drawW}" height="${barH}" fill="${seg.color}"/>`;
        const lbl = `${(share * 100).toFixed(1)}%`;
        if (drawW > textW(lbl) + 14) {
          s += `<text class="seg-label" x="${x + drawW / 2}" y="${by + barH / 2 + 4}" text-anchor="middle">${lbl}</text>`;
        }
        x += w;
      });
      s += '</g>';
    });
    s += '</svg>';

    // Share table doubles as the legend: every head, both dates, change in share
    const rows = cfg.legend.map((l, i) => {
      const shares = cols.map((col, ci) => {
        const seg = col.segments.find(g => g.label === l.label);
        return seg ? Math.max(seg.value, 0) / totals[ci] * 100 : 0;
      });
      return { ...l, shares, order: i };
    }).filter(r => r.shares.some(v => v > 0))
      .sort((a, b) => b.shares[b.shares.length - 1] - a.shares[a.shares.length - 1]);
    const head = `<div class="mix-row mix-head"><span></span>${cols.map(c => `<span>${esc(c.label)}</span>`).join('')}<span>${esc(L('chart.change'))}</span></div>`;
    const body = rows.map(r => {
      const d = r.shares[r.shares.length - 1] - r.shares[0];
      const flat = Math.abs(d) < 0.005;
      const cls = flat ? 'muted' : d > 0 ? 'pos' : 'neg';
      return `<div class="mix-row"><span class="mix-name"><i style="background:${r.color}"></i>${esc(r.label)}</span>` +
        r.shares.map(v => `<span>${v.toFixed(2)}%</span>`).join('') +
        `<span class="${cls}">${flat ? '' : d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} ${esc(L('unit.pp'))}</span></div>`;
    }).join('');
    el.innerHTML = `<div class="mix">${s}<div class="mix-table">${head}${body}</div></div>`;
  }

  /* ---------- Donut ---------- */
  function donut(el, cfg) {
    const segs = cfg.segments.filter(sg => sg.value > 0);
    const total = segs.reduce((t, sg) => t + sg.value, 0);
    if (!total) { el.innerHTML = `<p class="muted">${esc(L('chart.noBalances'))}</p>`; return; }
    const R = 100, r = 72, C = 110;
    let a0 = -Math.PI / 2;
    let s = `<svg viewBox="0 0 220 220" role="img" aria-label="${esc(cfg.title || 'Mix')}">`;
    segs.forEach(sg => {
      const frac = sg.value / total;
      const a1 = a0 + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const p = (rad, ang) => `${C + rad * Math.cos(ang)} ${C + rad * Math.sin(ang)}`;
      const d = frac >= 0.9999
        ? `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} L ${C - 0.01} ${C - r} A ${r} ${r} 0 1 0 ${C} ${C - r} Z`
        : `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
      s += `<path class="seg donut-seg" d="${d}" fill="${sg.color}" data-tip="${tip([sg.label, cfg.fmt(sg.value), L('chart.ofTotal', { p: `${(frac * 100).toFixed(2)}%` })])}"/>`;
      a0 = a1;
    });
    s += `<text x="${C}" y="${C - 6}" text-anchor="middle" class="axis-label">${esc(cfg.centerLabel || L('chart.total'))}</text>`;
    s += `<text x="${C}" y="${C + 16}" text-anchor="middle" class="donut-total">${esc(cfg.fmtShort(total))}</text>`;
    s += '</svg>';
    const legend = segs.map(sg => `<div><i style="background:${sg.color}"></i><span title="${esc(sg.label)}">${esc(sg.label)}</span><em>${esc(cfg.fmtShort(sg.value))}</em><b>${(sg.value / total * 100).toFixed(1)}%</b></div>`).join('');
    el.innerHTML = `<div class="donut-wrap"><div class="donut-svg">${s}</div><div class="donut-legend">${legend}</div></div>`;
  }

  /* ---------- Diverging bars (largest increases / decreases) ---------- */
  function diverging(el, cfg) {
    const items = cfg.items;
    if (!items.length) { el.innerHTML = `<p class="muted">${esc(L('chart.noChanges'))}</p>`; return; }
    const W = chartWidth(el);
    const labelW = Math.min(220, Math.round(W * 0.3));
    const rowH = 26, top = 22, pad = 58;
    const H = top + items.length * rowH;
    const m = Math.max(...items.map(i => Math.abs(i.value))) || 1;
    const t = ticks(-m, m, W < 560 ? 4 : 6);
    const lo = t[0], hi = t[t.length - 1];
    const x = v => labelW + pad + ((v - lo) / (hi - lo)) * (W - labelW - pad * 2);
    const maxChars = Math.max(10, Math.floor((labelW - 12) / 6.4));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || 'Largest changes')}">`;
    t.forEach(v => {
      s += `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${x(v)}" x2="${x(v)}" y1="${top - 4}" y2="${H}"/>`;
      s += `<text class="axis-label" x="${x(v)}" y="${top - 9}" text-anchor="middle">${esc(cfg.fmtAxis(v))}</text>`;
    });
    items.forEach((it, i) => {
      const y = top + i * rowH + 5;
      const x0 = x(0), x1 = x(it.value);
      const col = it.value >= 0 ? COLOR_POS : COLOR_NEG;
      s += `<g class="row" data-tip="${tip([it.label, ...(it.tipRows || [])])}">`;
      s += `<rect class="hit" x="0" y="${y - 5}" width="${W}" height="${rowH}"/>`;
      s += `<text class="cat-label" x="${labelW - 10}" y="${y + 12}" text-anchor="end">${esc(truncate(it.label, maxChars))}</text>`;
      s += `<path class="bar" d="${hbar(x0, y, x1 - x0, 16)}" fill="${col}"/>`;
      const v = cfg.fmtAxis(it.value);
      s += it.value >= 0
        ? `<text class="delta-label" x="${x1 + 6}" y="${y + 12}">+${esc(v)}</text>`
        : `<text class="delta-label" x="${x1 - 6}" y="${y + 12}" text-anchor="end">${esc(v)}</text>`;
      s += '</g>';
    });
    s += '</svg>';
    el.innerHTML = s;
  }

  /* ---------- Shared tooltip ---------- */
  function bindTooltip() {
    const tt = document.getElementById('tooltip');
    if (!tt) return;
    document.addEventListener('mousemove', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) { tt.classList.remove('show'); return; }
      const lines = t.getAttribute('data-tip').split('\n');
      tt.innerHTML = `<b>${esc(lines[0])}</b>` + lines.slice(1).map(l => `<div>${esc(l)}</div>`).join('');
      const pad = 14;
      let x = e.clientX + pad, y = e.clientY + pad;
      const r = tt.getBoundingClientRect();
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
      tt.style.left = x + 'px';
      tt.style.top = y + 'px';
      tt.classList.add('show');
    });
  }

  root.BSCharts = { groupedBars, stacked100, donut, diverging, bindTooltip, PALETTE, COLOR_OTHER, COLOR_A, COLOR_B, esc };
})(window);
