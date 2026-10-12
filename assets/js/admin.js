/**
 * ============================================================================
 * LOAN CHARGES ADMIN (admin.html)
 * Sign in with Supabase Auth, edit loan_schemes / loan_scheme_fields, save via
 * the admin_save_loan_scheme() database function (see
 * supabase/migrations/20261012120000_loan_admin.sql), which re-checks that the
 * user is an admin, saves atomically and writes an audit entry.
 * Everything from the database is rendered with textContent / value, never as HTML.
 * ============================================================================
 */
(function () {
  'use strict';

  // Same project and public key as tools/loan charges.html. NEVER put the service_role key here.
  const SUPABASE_URL      = "https://cuuupfgivmpybetgdrdn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_f_Dt4RkpuqUHggt6SkExBg_WlgB0fsi";
  const TIMEOUT_MS        = 15000;
  const IDLE_LIMIT_MS     = 30 * 60 * 1000;      // sign out after 30 min without activity
  const SESSION_KEY       = 'qa_admin_session';   // sessionStorage: gone when the tab closes
  const LOAN_CACHE_KEY    = 'qa_loan_v2:schemes'; // Loan Charges page cache, cleared after a save

  const Engine = window.BankingLoanChargesEngine;
  const KINDS = [
    { value: 'input',  label: 'Input' },
    { value: 'select', label: 'Dropdown' },
    { value: 'output', label: 'Calculated' }
  ];

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let session = null;        // { access_token, refresh_token, expires_at, email }
  let schemes = [];          // as loaded from the server
  let selectedId = null;     // server id of the scheme being edited, or 'new'
  let original = null;       // editor snapshot when loaded (for dirty check + diff)
  let draft = null;          // { id, updated_at, code, name, sort_order, active, lines: [...] }
  let uidSeq = 0;
  // Sidebar item colours, same palette and hashing as the calculator shell (main.js)
  const NAV_PALETTE = [
    { color: '#6366F1', rgb: '99, 102, 241' }, { color: '#10B981', rgb: '16, 185, 129' },
    { color: '#3B82F6', rgb: '59, 130, 246' }, { color: '#F59E0B', rgb: '245, 158, 11' },
    { color: '#8B5CF6', rgb: '139, 92, 246' }, { color: '#F43F5E', rgb: '244, 63, 94' },
    { color: '#14B8A6', rgb: '20, 184, 166' }, { color: '#F97316', rgb: '249, 115, 22' },
    { color: '#06B6D4', rgb: '6, 182, 212' }, { color: '#EC4899', rgb: '236, 72, 153' },
    { color: '#2563EB', rgb: '37, 99, 235' }, { color: '#059669', rgb: '5, 150, 105' },
    { color: '#EF4444', rgb: '239, 68, 68' }, { color: '#7C3AED', rgb: '124, 58, 237' }
  ];
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return Math.abs(hash);
  }
  let lastActivity = Date.now();
  let saving = false;

  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------
  function request(url, opts) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return fetch(url, Object.assign({ signal: ctrl.signal, cache: 'no-store' }, opts))
      .then(res => res.text().then(text => {
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
        if (!res.ok) {
          const err = new Error((body && (body.message || body.msg || body.error_description || body.error)) || ('Server replied ' + res.status));
          err.status = res.status;
          err.code = body && body.code;
          throw err;
        }
        return body;
      }))
      .catch(err => {
        if (err.name === 'AbortError') throw new Error('Connection timed out.');
        if (err instanceof TypeError) throw new Error('Network error: server unreachable.');
        throw err;
      })
      .finally(() => clearTimeout(timer));
  }

  function authRequest(path, body, token) {
    const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return request(SUPABASE_URL + '/auth/v1/' + path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) });
  }

  function storeSession(data) {
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at ? data.expires_at * 1000 : Date.now() + (data.expires_in || 3600) * 1000,
      email: (data.user && data.user.email) || (session && session.email) || ''
    };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
  }

  function clearSession() {
    session = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  let refreshing = null;
  function refreshSession() {
    if (!session || !session.refresh_token) return Promise.reject(new Error('Not signed in'));
    if (!refreshing) {
      refreshing = authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
        .then(storeSession)
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  function validToken() {
    if (!session) return Promise.reject(sessionExpired());
    if (Date.now() < session.expires_at - 60000) return Promise.resolve(session.access_token);
    return refreshSession().then(() => session.access_token, () => { throw sessionExpired(); });
  }

  function sessionExpired() {
    const e = new Error('Your session has expired. Please sign in again.');
    e.sessionExpired = true;
    return e;
  }

  /** PostgREST call as the signed-in admin. Retries once with a refreshed token on 401. */
  function api(path, opts, retried) {
    opts = opts || {};
    return validToken().then(token => request(SUPABASE_URL + '/rest/v1/' + path, {
      method: opts.method || 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    })).catch(err => {
      if (err.status === 401 && !retried) {
        return refreshSession().then(() => api(path, opts, true), () => { throw sessionExpired(); });
      }
      if (err.status === 401) throw sessionExpired();
      throw err;
    });
  }

  /** Turn database errors into messages an administrator can act on. */
  function describeSaveError(err) {
    switch (err.code) {
      case '42501': return 'Your account is not allowed to edit loan charges.';
      case '40001': return err.message + ' (use Discard to reload)';
      case 'P0002': return 'This scheme no longer exists. Reload the list.';
      case '23505': return /scheme_code|code/.test(err.message) ? 'Another scheme already uses this code.' : 'Two lines use the same key.';
      case '23514': return 'The database rejected a value (' + err.message + ').';
      case '22023': return err.message;
      case '22P02': return 'A number is not valid (' + err.message + ').';
      default: return err.message || 'Save failed.';
    }
  }

  // ---------------------------------------------------------------------------
  // Sign in / out
  // ---------------------------------------------------------------------------
  function showLogin(message) {
    $('editor-view').hidden = true;
    $('save-bar').hidden = true;
    $('header-user').hidden = true;
    $('login-view').hidden = false;
    setLoginError(message || '');
    $('login-password').value = '';
    $('login-password').type = 'password';
    $('btn-reveal').querySelector('use').setAttribute('href', '#i-eye');
    $('btn-reveal').setAttribute('aria-label', 'Show password');
    $((message || !$('login-email').value) ? 'login-email' : 'login-password').focus();
  }

  function setLoginError(msg) {
    const el = $('login-error');
    el.textContent = msg;
    el.classList.toggle('show', !!msg);
  }

  function onLogin(e) {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return setLoginError('Enter a valid email address.');
    if (!password) return setLoginError('Enter your password.');

    setLoginError('');
    $('btn-login').disabled = true;
    loader(true);
    authRequest('token?grant_type=password', { email: email, password: password })
      .then(data => { storeSession(data); return checkAdmin(); })
      .then(startEditor)
      .catch(err => {
        clearSession();
        const msg = err.notAdmin ? err.message
          : (err.status === 400 || err.status === 401) ? 'Incorrect email or password.'
          : err.message;
        setLoginError(msg);
        $('login-password').value = '';
      })
      .finally(() => { loader(false); $('btn-login').disabled = false; });
  }

  function checkAdmin() {
    return api('rpc/is_loan_admin', { method: 'POST', body: {} }).then(isAdmin => {
      if (isAdmin !== true) {
        const token = session && session.access_token;
        if (token) authRequest('logout', {}, token).catch(() => {});
        const e = new Error('This account is not registered as a loan administrator.');
        e.notAdmin = true;
        throw e;
      }
    });
  }

  function logout(message) {
    const token = session && session.access_token;
    clearSession();
    if (token) authRequest('logout', {}, token).catch(() => {});
    schemes = []; draft = null; original = null; selectedId = null;
    showLogin(message);
  }

  function onLogoutClick() {
    if (isDirty() && !window.confirm('You have unsaved changes. Sign out and lose them?')) return;
    logout();
  }

  function handleApiError(err, fallback) {
    if (err && err.sessionExpired) { logout(err.message); return; }
    BankingCore.toast.error((fallback ? fallback + ': ' : '') + (err && err.message ? err.message : err), 6000);
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  function startEditor() {
    $('login-view').hidden = true;
    $('editor-view').hidden = false;
    $('save-bar').hidden = false;
    $('header-user').hidden = false;
    $('user-email').textContent = session.email;
    $('user-avatar').textContent = (session.email || 'A').charAt(0).toUpperCase();
    lastActivity = Date.now();
    return loadSchemes();
  }

  function loadSchemes(selectAfter) {
    loader(true);
    const path = 'loan_schemes?select=id,scheme_code,name,sort_order,active,updated_at,' +
      'loan_scheme_fields(key,label,kind,formula,default_value,options,in_total,sort_order)' +
      '&order=sort_order.asc,name.asc&loan_scheme_fields.order=sort_order.asc';
    return api(path)
      .then(rows => {
        schemes = rows || [];
        renderSchemeList();
        const id = selectAfter !== undefined ? selectAfter : selectedId;
        if (id !== null && id !== 'new' && schemes.some(s => s.id === id)) openScheme(id);
        else if (id === null) showEmpty();
      })
      .catch(err => handleApiError(err, 'Could not load schemes'))
      .finally(() => loader(false));
  }

  function loadHistory(schemeId) {
    const list = $('history-list');
    list.textContent = '';
    if (schemeId === null) return addHistoryNote('Not saved yet.');
    addHistoryNote('Loading…');
    api('loan_scheme_audit?select=action,changed_by_email,changed_at&scheme_id=eq.' + Number(schemeId) +
        '&order=changed_at.desc&limit=8')
      .then(rows => {
        if (!draft || draft.id !== schemeId) return;
        list.textContent = '';
        if (!rows.length) return addHistoryNote('No changes recorded through this page yet.');
        rows.forEach(r => {
          const li = document.createElement('li');
          const who = document.createElement('span');
          who.className = 'who';
          who.textContent = (r.action === 'create' ? 'Created by ' : 'Edited by ') + (r.changed_by_email || 'unknown');
          const when = document.createElement('span');
          when.className = 'when';
          when.textContent = new Date(r.changed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          li.append(who, when);
          list.appendChild(li);
        });
      })
      .catch(() => { list.textContent = ''; addHistoryNote('History unavailable.'); });
  }

  function addHistoryNote(text) {
    const li = document.createElement('li');
    li.className = 'who';
    li.textContent = text;
    $('history-list').appendChild(li);
  }

  // ---------------------------------------------------------------------------
  // Scheme list
  // ---------------------------------------------------------------------------
  function renderSchemeList() {
    const q = $('scheme-search').value.trim().toLowerCase();
    const list = $('scheme-list');
    list.textContent = '';
    renderStats();
    const shown = schemes.filter(s => !q || s.scheme_code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    if (!shown.length) {
      const li = document.createElement('li');
      li.className = 'list-empty';
      li.textContent = schemes.length ? 'No scheme matches.' : 'No schemes yet.';
      list.appendChild(li);
      fitSchemeList();
      return;
    }
    shown.forEach(s => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-item scheme-item' + (s.id === selectedId ? ' active' : '') + (s.active ? '' : ' inactive');
      btn.title = s.active ? s.name : s.name + ' (inactive: hidden from staff)';
      // Same item markup and colours as the calculator sidebar (main.js), so main.css hover/active effects apply
      const theme = NAV_PALETTE[hashString(String(s.scheme_code)) % NAV_PALETTE.length];
      btn.style.setProperty('--item-color', theme.color);
      btn.style.setProperty('--item-rgb', theme.rgb);
      const code = el('span', { className: 'nav-icon-box code', textContent: s.scheme_code });
      code.style.background = 'rgba(' + theme.rgb + ', 0.15)';
      code.style.color = theme.color;
      btn.append(el('span', { className: 'nav-indicator' }), code, el('span', { className: 'nav-text name', textContent: s.name }));
      if (!s.active) btn.appendChild(el('span', { className: 'badge badge-warning', textContent: 'Off' }));
      btn.append(el('span', { className: 'nav-active-pill' }), el('span', { className: 'nav-arrow' }, [icon('chevron-right', 'ic-sm')]));
      btn.addEventListener('click', () => { if (s.id !== selectedId && confirmDiscard()) openScheme(s.id); });
      li.appendChild(btn);
      list.appendChild(li);
    });
    fitSchemeList();
  }

  function renderStats() {
    const active = schemes.filter(s => s.active).length;
    $('scheme-count').textContent = schemes.length;
    $('stat-total').textContent = schemes.length;
    $('stat-active').textContent = active;
    $('stat-inactive').textContent = schemes.length - active;
    $('stat-lines').textContent = schemes.reduce((n, s) => n + (s.loan_scheme_fields || []).length, 0);
  }

  // Size the scheme list so every scheme is visible without scrolling: rows shrink with the
  // number of schemes, then the list switches to 2 columns (code + short name) and 3 columns
  // (code only). Only a very large list on a very short screen still scrolls.
  const ROW_MAX = 40, ROW_MIN = [16, 20, 20];   // smallest row height for 1, 2 and 3 columns
  function fitSchemeList() {
    const list = $('scheme-list');
    const scroller = list.parentElement;
    const n = list.querySelectorAll('.scheme-item').length;
    list.classList.remove('cols-2', 'cols-3');
    list.style.removeProperty('--scheme-cols');
    list.style.removeProperty('--scheme-row');
    if (!n) return;
    const cs = getComputedStyle(scroller);
    const avail = scroller.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2;
    if (avail <= 0) return;
    let cols = 1;
    while (cols < ROW_MIN.length && Math.ceil(n / cols) * ROW_MIN[cols - 1] > avail) cols++;
    let row = Math.max(ROW_MIN[cols - 1], Math.min(ROW_MAX, Math.floor(avail / Math.ceil(n / cols))));
    if (cols > 1) list.classList.add('cols-' + cols);
    list.style.setProperty('--scheme-cols', String(cols));
    list.style.setProperty('--scheme-row', row + 'px');
    // Rounding and borders can still leave a pixel or two of overflow: tighten until it fits
    while (row > ROW_MIN[cols - 1] && scroller.scrollHeight > scroller.clientHeight) {
      list.style.setProperty('--scheme-row', --row + 'px');
    }
  }

  // Compact the charge line rows (two steps) when they do not fit in the space left on screen;
  // if even the most compact rows do not fit, the table scrolls under its fixed header.
  function fitLines() {
    const table = document.querySelector('.lines-table');
    const box = document.querySelector('.lines-scroll');
    if (!table || !box || $('scheme-editor').hidden) return;
    table.classList.remove('dense', 'dense-2');
    const overflows = () => box.scrollHeight > box.clientHeight + 1;
    if (overflows()) table.classList.add('dense');
    if (overflows()) table.classList.add('dense-2');
  }


  function confirmDiscard() {
    return !isDirty() || window.confirm('You have unsaved changes. Discard them?');
  }

  function showEmpty() {
    selectedId = null; draft = null; original = null;
    $('scheme-editor').hidden = true;
    $('empty-state').hidden = false;
    $('crumb-current').textContent = 'Overview';
    renderSchemeList();
    updateSaveBar();
  }

  // ---------------------------------------------------------------------------
  // Editor model
  // ---------------------------------------------------------------------------
  function optionsToText(options) {
    return Array.isArray(options) ? options.map(o => o.label + ':' + o.value).join(', ') : '';
  }

  function lineFromRow(f) {
    return {
      uid: ++uidSeq,
      key: f.key || '',
      label: f.label || '',
      kind: f.kind || 'input',
      formula: f.formula || '',
      default_value: f.default_value === null || f.default_value === undefined ? '' : String(f.default_value),
      options: optionsToText(f.options),
      in_total: !!f.in_total
    };
  }

  function draftFromScheme(s) {
    return {
      id: s.id,
      updated_at: s.updated_at,
      code: s.scheme_code,
      name: s.name,
      sort_order: String(s.sort_order),
      active: !!s.active,
      lines: (s.loan_scheme_fields || []).map(lineFromRow)
    };
  }

  // Comparable form of a draft, without ids that change between loads
  function comparable(d) {
    return JSON.stringify({
      code: d.code.trim(), name: d.name.trim(), sort_order: String(d.sort_order).trim(), active: d.active,
      lines: d.lines.map(l => [l.key.trim(), l.label.trim(), l.kind, l.formula.trim(), l.default_value.trim(), l.options.trim(), l.in_total])
    });
  }

  function isDirty() {
    return !!draft && (draft.id === null || comparable(draft) !== comparable(original));
  }

  function openScheme(id) {
    const s = schemes.find(x => x.id === id);
    if (!s) return;
    selectedId = id;
    draft = draftFromScheme(s);
    original = draftFromScheme(s);
    showEditor();
    loadHistory(id);
  }

  function newScheme(copyFrom) {
    if (!confirmDiscard()) return;
    const maxOrder = schemes.reduce((m, s) => Math.max(m, s.sort_order || 0), 0);
    const base = copyFrom ? JSON.parse(JSON.stringify(copyFrom)) : null;
    draft = {
      id: null,
      updated_at: null,
      code: '',
      name: base ? base.name + ' (COPY)' : '',
      sort_order: String(maxOrder + 10),
      active: true,
      lines: base ? base.lines.map(l => Object.assign({}, l, { uid: ++uidSeq }))
                  : [lineFromRow({ key: 'amount', label: 'LOAN AMOUNT', kind: 'input' })]
    };
    original = JSON.parse(JSON.stringify(draft));
    selectedId = 'new';
    showEditor();
    loadHistory(null);
    $('s-code').focus();
  }

  function showEditor() {
    $('empty-state').hidden = true;
    $('scheme-editor').hidden = false;
    $('s-code').value = draft.code;
    $('s-name').value = draft.name;
    $('s-order').value = draft.sort_order;
    $('s-active').checked = draft.active;
    $('btn-duplicate').hidden = draft.id === null;
    renderSchemeList();
    renderLines();
  }

  // ---------------------------------------------------------------------------
  // Lines table
  // ---------------------------------------------------------------------------
  function el(tag, props, children) {
    const n = document.createElement(tag);
    if (props) Object.keys(props).forEach(k => {
      if (k === 'dataset') Object.assign(n.dataset, props[k]);
      else n[k] = props[k];
    });
    (children || []).forEach(c => n.appendChild(c));
    return n;
  }

  /** Icon from the <symbol> set in admin.html */
  function icon(name, cls) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  function cellWithMsg(control, field) {
    return el('td', { className: control.dataset.col || '' }, [control, el('span', { className: 'field-msg', dataset: { field: field } })]);
  }

  function renderLines() {
    const body = $('lines-body');
    body.textContent = '';
    draft.lines.forEach((line, i) => {
      const tr = el('tr', { className: 'kind-' + line.kind, dataset: { uid: String(line.uid) } });

      const up = el('button', { type: 'button', className: 'icon-btn', title: 'Move up', disabled: i === 0 }, [icon('up', 'ic-sm')]);
      const down = el('button', { type: 'button', className: 'icon-btn', title: 'Move down', disabled: i === draft.lines.length - 1 }, [icon('down', 'ic-sm')]);
      up.setAttribute('aria-label', 'Move line ' + (i + 1) + ' up');
      down.setAttribute('aria-label', 'Move line ' + (i + 1) + ' down');
      up.addEventListener('click', () => moveLine(i, -1));
      down.addEventListener('click', () => moveLine(i, 1));
      tr.appendChild(el('td', { className: 'col-order' }, [el('span', { className: 'row-num', textContent: String(i + 1) }), up, down]));

      const key = el('input', { className: 'form-control mono', value: line.key, maxLength: 40, placeholder: 'e.g. stamp_duty', spellcheck: false });
      key.setAttribute('aria-label', 'Key of line ' + (i + 1));
      key.addEventListener('input', () => { key.value = key.value.toLowerCase().replace(/\s+/g, '_'); line.key = key.value; changed(); });
      tr.appendChild(cellWithMsg(key, 'key'));

      const label = el('input', { className: 'form-control', value: line.label, maxLength: 120, placeholder: 'Shown to staff and on the printout' });
      label.setAttribute('aria-label', 'Label of line ' + (i + 1));
      label.addEventListener('input', () => { line.label = label.value; changed(); });
      tr.appendChild(cellWithMsg(label, 'label'));

      const kind = el('select', { className: 'form-control' }, KINDS.map(k => el('option', { value: k.value, textContent: k.label })));
      kind.value = line.kind;
      kind.setAttribute('aria-label', 'Type of line ' + (i + 1));
      kind.addEventListener('change', () => { line.kind = kind.value; changed(); renderLines(); });
      tr.appendChild(el('td', { className: 'col-kind' }, [kind]));

      let valueInput;
      if (line.kind === 'output') {
        valueInput = el('input', { className: 'form-control mono', value: line.formula, maxLength: 500, placeholder: 'e.g. amount*1%', spellcheck: false });
        valueInput.addEventListener('input', () => { line.formula = valueInput.value; changed(); });
      } else if (line.kind === 'select') {
        valueInput = el('input', { className: 'form-control', value: line.options, maxLength: 500, placeholder: 'Label:value, Label:value' });
        valueInput.addEventListener('input', () => { line.options = valueInput.value; changed(); });
      } else {
        valueInput = el('input', { className: 'form-control mono', value: line.default_value, inputMode: 'decimal', placeholder: 'Default value (optional)' });
        valueInput.addEventListener('input', () => { line.default_value = valueInput.value; changed(); });
      }
      valueInput.setAttribute('aria-label', 'Formula, default or options of line ' + (i + 1));
      tr.appendChild(cellWithMsg(valueInput, 'value'));

      const total = el('input', { type: 'checkbox', checked: line.in_total, title: 'Add to TOTAL DEDUCTIONS' });
      total.setAttribute('aria-label', 'Include line ' + (i + 1) + ' in total');
      total.addEventListener('change', () => { line.in_total = total.checked; changed(); });
      tr.appendChild(el('td', { className: 'col-total' }, [total]));

      tr.appendChild(el('td', { className: 'col-preview', dataset: { preview: '1' } }));

      const del = el('button', { type: 'button', className: 'icon-btn danger', title: 'Delete line' }, [icon('trash', 'ic-sm')]);
      del.setAttribute('aria-label', 'Delete line ' + (i + 1));
      del.addEventListener('click', () => deleteLine(i));
      tr.appendChild(el('td', { className: 'col-del' }, [del]));

      body.appendChild(tr);
    });
    $('line-count').textContent = draft.lines.length + (draft.lines.length === 1 ? ' line' : ' lines');
    const legend = $('kind-legend');
    legend.textContent = '';
    KINDS.forEach(k => {
      const n = draft.lines.filter(l => l.kind === k.value).length;
      const item = el('span', {}, [el('b', { textContent: String(n) }), document.createTextNode(' ' + k.label)]);
      item.style.setProperty('--k', 'var(--kind-' + k.value + ')');
      legend.appendChild(item);
    });
    refresh();
    fitLines();
  }

  function moveLine(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= draft.lines.length) return;
    const t = draft.lines[i]; draft.lines[i] = draft.lines[j]; draft.lines[j] = t;
    renderLines();
  }

  function deleteLine(i) {
    const line = draft.lines[i];
    const used = usedBy(line.key);
    if (used.length && !window.confirm('"' + (line.label || line.key) + '" is used in the formula of: ' + used.join(', ') + '.\nDelete it anyway?')) return;
    draft.lines.splice(i, 1);
    renderLines();
  }

  function addLine() {
    draft.lines.push(lineFromRow({ kind: 'output', in_total: true }));
    renderLines();
    const rows = $('lines-body').rows;
    rows[rows.length - 1].querySelector('input').focus();
  }

  function usedBy(key) {
    if (!key) return [];
    const re = new RegExp('(^|[^A-Za-z0-9_.])' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_.(])', 'i');
    return draft.lines.filter(l => l.kind === 'output' && l.key !== key && re.test(l.formula)).map(l => l.label || l.key);
  }

  // ---------------------------------------------------------------------------
  // Validation (the database re-checks key format, uniqueness, required formula/options)
  // ---------------------------------------------------------------------------
  const KEY_RE = /^[a-z][a-z0-9_]*$/;
  const CELL_LIKE_RE = /^[a-z]+[0-9]+$/;
  const RESERVED = ['true', 'false'].concat(Object.keys(Engine.FUNCTIONS).map(f => f.toLowerCase()));

  function parseOptions(text) {
    const parts = text.split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return { error: 'Add at least one choice, e.g. 1st:0, 2nd:1' };
    const out = [];
    for (const p of parts) {
      const at = p.lastIndexOf(':');
      const label = at === -1 ? '' : p.slice(0, at).trim();
      const raw = at === -1 ? '' : p.slice(at + 1).trim();
      if (!label || raw === '') return { error: '"' + p + '" must look like Label:value' };
      const value = Number(raw);
      if (!isFinite(value)) return { error: 'Value of "' + label + '" is not a number' };
      if (out.some(o => o.label.toLowerCase() === label.toLowerCase())) return { error: 'Choice "' + label + '" is listed twice' };
      out.push({ label: label, value: value });
    }
    return { options: out };
  }

  function isNumber(s) {
    return /^-?(\d+(\.\d*)?|\.\d+)$/.test(String(s).trim());
  }

  /** @returns {{scheme:Object<string,string>, lines:Object<number,Object<string,string>>, count:number, compiled:Object|null}} */
  function validate() {
    const res = { scheme: {}, lines: {}, count: 0, compiled: null };
    const add = (uid, field, msg) => {
      res.lines[uid] = res.lines[uid] || {};
      if (!res.lines[uid][field]) { res.lines[uid][field] = msg; res.count++; }
    };
    const code = draft.code.trim();
    if (!code) res.scheme.code = 'Required';
    else if (!/^[0-9]{1,10}$/.test(code)) res.scheme.code = 'Digits only';
    else if (schemes.some(s => s.scheme_code === code && s.id !== draft.id)) res.scheme.code = 'Code already used';
    if (!draft.name.trim()) res.scheme.name = 'Required';
    if (!/^-?\d{1,9}$/.test(String(draft.sort_order).trim())) res.scheme.sort_order = 'Whole number';
    res.count += Object.keys(res.scheme).length;

    if (!draft.lines.length) { res.scheme.lines = 'Add at least one line'; res.count++; }

    const seen = {};
    draft.lines.forEach(l => {
      const key = l.key.trim();
      if (!key) add(l.uid, 'key', 'Required');
      else if (!KEY_RE.test(key)) add(l.uid, 'key', 'Start with a letter; a–z, 0–9, _ only');
      else if (CELL_LIKE_RE.test(key)) add(l.uid, 'key', 'Looks like a cell (b12); add _ or a word');
      else if (RESERVED.includes(key)) add(l.uid, 'key', 'Reserved word');
      else if (seen[key]) { add(l.uid, 'key', 'Duplicate key'); add(seen[key], 'key', 'Duplicate key'); }
      if (key) seen[key] = seen[key] || l.uid;

      if (!l.label.trim()) add(l.uid, 'label', 'Required');

      if (l.kind === 'output' && !l.formula.trim()) add(l.uid, 'value', 'Formula required');
      if (l.kind === 'select') {
        const p = parseOptions(l.options);
        if (p.error) add(l.uid, 'value', p.error);
      }
      if (l.kind === 'input' && l.default_value.trim() !== '' && !isNumber(l.default_value)) add(l.uid, 'value', 'Must be a number');
    });

    // Formula check with the same engine the calculator uses (only once every key is valid,
    // otherwise references cannot be resolved)
    const keysOk = draft.lines.every(l => !(res.lines[l.uid] && res.lines[l.uid].key));
    if (keysOk && draft.lines.length) {
      const compiled = Engine.compile(draft.lines.map(toEngineField));
      Object.keys(compiled.errors).forEach(i => add(draft.lines[i].uid, 'value', compiled.errors[i]));
      res.compiled = compiled;
    }
    return res;
  }

  function toEngineField(l) {
    const f = { key: l.key.trim(), label: l.label.trim(), kind: l.kind, in_total: l.in_total };
    if (l.kind === 'output') f.formula = l.formula.trim();
    if (l.kind === 'select') { const p = parseOptions(l.options); f.options = p.options || []; }
    if (l.kind === 'input' && isNumber(l.default_value)) f.default_value = Number(l.default_value);
    return f;
  }

  // ---------------------------------------------------------------------------
  // Refresh validation messages, preview and save bar (no re-render, keeps focus)
  // ---------------------------------------------------------------------------
  let lastValidation = null;

  function changed() {
    refresh();
  }

  function refresh() {
    const v = validate();
    lastValidation = v;

    ['code', 'name', 'sort_order'].forEach(f => {
      const msg = document.querySelector('.field-msg[data-for="' + f + '"]');
      msg.textContent = v.scheme[f] || '';
      $({ code: 's-code', name: 's-name', sort_order: 's-order' }[f]).classList.toggle('invalid', !!v.scheme[f]);
    });
    $('s-active-label').textContent = draft.active ? 'Active (visible to staff)' : 'Inactive (hidden from staff)';
    renderEditorHeader();

    Array.from($('lines-body').rows).forEach(tr => {
      const errs = v.lines[tr.dataset.uid] || {};
      tr.classList.toggle('row-error', Object.keys(errs).length > 0);
      tr.querySelectorAll('.field-msg').forEach(m => {
        m.textContent = errs[m.dataset.field] || '';
        const input = m.previousElementSibling;
        if (input) input.classList.toggle('invalid', !!errs[m.dataset.field]);
      });
    });

    updatePreview(v.compiled);
    updateSaveBar();
  }

  function renderEditorHeader() {
    const isNew = draft.id === null;
    const title = isNew ? 'New scheme' : (original.name || '');
    $('editor-heading').textContent = title;
    $('crumb-current').textContent = title;
    $('editor-code').hidden = isNew;
    $('editor-code').textContent = isNew ? '' : original.code;
    const status = $('editor-status');
    status.textContent = isNew ? 'Draft' : draft.active ? 'Active' : 'Inactive';
    status.className = 'chip chip-status ' + (isNew ? 'draft' : draft.active ? 'on' : 'off');
    const meta = $('editor-meta');
    meta.textContent = '';
    const when = isNew ? 'Not saved yet'
      : draft.updated_at ? 'Last updated ' + new Date(draft.updated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    if (when) meta.appendChild(el('span', { className: 'meta' }, [icon('calendar', 'ic-sm'), document.createTextNode(when)]));
    meta.appendChild(el('span', { className: 'meta' }, [icon('info', 'ic-sm'), document.createTextNode(draft.active ? 'Visible to staff in Loan Charges' : 'Hidden from staff')]));
  }

  function fmt(n) {
    return BankingCore.formatINR(n || 0, { showSymbol: false, decimals: 2 });
  }

  function updatePreview(compiled) {
    const cells = $('lines-body').querySelectorAll('td[data-preview]');
    if (!compiled) {
      cells.forEach(c => { c.textContent = '—'; c.className = 'col-preview'; c.title = 'Fix the keys first'; });
      $('preview-total').textContent = '—';
      return;
    }
    const inputs = {};
    draft.lines.forEach((l, i) => {
      if (l.kind === 'output') return;
      if (l.kind === 'select') inputs[i] = (compiled.fields[i].options[0] || { value: 0 }).value;
      else inputs[i] = Engine.initialValue(compiled.fields[i]) || 0;
    });
    const r = compiled.evaluate(inputs);
    cells.forEach((c, i) => {
      const err = r.errors[i];
      c.className = 'col-preview' + (err ? ' preview-err' : '');
      c.textContent = err ? 'ERR' : (draft.lines[i].kind === 'output' ? fmt(r.values[i]) : '');
      c.title = err || '';
    });
    $('preview-total').textContent = fmt(r.total);
  }

  function updateSaveBar() {
    const dirty = isDirty();
    const errors = lastValidation && draft ? lastValidation.count : 0;
    const state = $('save-state');
    if (!draft) { state.textContent = 'No scheme selected'; state.className = 'state'; }
    else if (dirty && errors) { state.textContent = errors + ' problem' + (errors > 1 ? 's' : '') + ' to fix before saving'; state.className = 'state error'; }
    else if (dirty) { state.textContent = 'Unsaved changes'; state.className = 'state dirty'; }
    else { state.textContent = 'All changes saved'; state.className = 'state'; }
    $('btn-save').disabled = !dirty || errors > 0 || saving;
    $('btn-discard').disabled = !dirty || saving;
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  function describeChanges() {
    const out = [];
    if (draft.id === null) {
      out.push('Create scheme (' + draft.code.trim() + ') ' + draft.name.trim() + ' with ' + draft.lines.length + ' lines');
      if (!draft.active) out.push('Scheme will be inactive (hidden from staff)');
      return out;
    }
    if (draft.code.trim() !== original.code) out.push('Code: ' + original.code + ' → ' + draft.code.trim());
    if (draft.name.trim() !== original.name) out.push('Name: ' + original.name + ' → ' + draft.name.trim());
    if (String(draft.sort_order).trim() !== String(original.sort_order)) out.push('Display order: ' + original.sort_order + ' → ' + String(draft.sort_order).trim());
    if (draft.active !== original.active) out.push(draft.active ? 'Activate scheme (visible to staff)' : 'Deactivate scheme (hidden from staff)');

    const before = {};
    original.lines.forEach(l => { before[l.key] = l; });
    const after = {};
    draft.lines.forEach(l => { after[l.key.trim()] = l; });
    draft.lines.forEach(l => {
      const k = l.key.trim();
      const o = before[k];
      if (!o) { out.push('Add line ' + (l.label.trim() || k)); return; }
      const what = [];
      if (o.label !== l.label.trim()) what.push('label');
      if (o.kind !== l.kind) what.push('type');
      if (l.kind === 'output' && o.formula.trim() !== l.formula.trim()) what.push('formula “' + o.formula + '” → “' + l.formula.trim() + '”');
      if (l.kind === 'input' && o.default_value.trim() !== l.default_value.trim()) what.push('default ' + (o.default_value || 'none') + ' → ' + (l.default_value.trim() || 'none'));
      if (l.kind === 'select' && o.options.trim() !== l.options.trim()) what.push('choices');
      if (o.in_total !== l.in_total) what.push(l.in_total ? 'now in total' : 'removed from total');
      if (what.length) out.push((l.label.trim() || k) + ': ' + what.join('; '));
    });
    original.lines.forEach(l => { if (!after[l.key]) out.push('Remove line ' + l.label); });
    const orderBefore = original.lines.map(l => l.key).filter(k => after[k]).join();
    const orderAfter = draft.lines.map(l => l.key.trim()).filter(k => before[k]).join();
    if (orderBefore !== orderAfter) out.push('Lines reordered');
    return out.length ? out : ['No visible changes'];
  }

  function askSave() {
    refresh();
    if ($('btn-save').disabled) return;
    const list = $('confirm-list');
    list.textContent = '';
    describeChanges().forEach(t => list.appendChild(el('li', { textContent: t })));
    $('confirm-modal').hidden = false;
    $('btn-confirm-save').focus();
  }

  function closeModal() {
    $('confirm-modal').hidden = true;
  }

  function save() {
    closeModal();
    const v = validate();
    if (v.count) { refresh(); return; }

    const payload = {
      p_scheme: {
        id: draft.id,
        scheme_code: draft.code.trim(),
        name: draft.name.trim(),
        sort_order: parseInt(String(draft.sort_order).trim(), 10),
        active: draft.active
      },
      p_fields: draft.lines.map(l => ({
        key: l.key.trim(),
        label: l.label.trim(),
        kind: l.kind,
        formula: l.kind === 'output' ? l.formula.trim() : null,
        default_value: l.kind === 'input' && l.default_value.trim() !== '' ? l.default_value.trim() : null,
        options: l.kind === 'select' ? parseOptions(l.options).options : null,
        in_total: l.in_total
      })),
      p_expected_updated_at: draft.updated_at
    };

    saving = true;
    updateSaveBar();
    loader(true);
    api('rpc/admin_save_loan_scheme', { method: 'POST', body: payload })
      .then(result => {
        // Make the Loan Charges calculator in this browser fetch the new values
        try { localStorage.removeItem(LOAN_CACHE_KEY); } catch (e) {}
        BankingCore.toast.success('Saved. Loan Charges now uses the new values.', 4000);
        original = null; draft = null;
        return loadSchemes(result.id).then(() => { if (!draft) openScheme(result.id); });
      })
      .catch(err => {
        if (err && err.sessionExpired) return handleApiError(err);
        BankingCore.toast.error(describeSaveError(err), 8000);
      })
      .finally(() => { saving = false; loader(false); updateSaveBar(); });
  }

  function discard() {
    if (!window.confirm('Discard all unsaved changes?')) return;
    if (draft.id === null) {
      draft = null; original = null;
      showEmpty();
    } else {
      // Reload from the server, so a scheme someone else changed comes back current
      const id = draft.id;
      draft = null; original = null;
      loadSchemes(id);
    }
  }

  // ---------------------------------------------------------------------------
  // Misc
  // ---------------------------------------------------------------------------
  function loader(show) {
    $('loader').classList.toggle('show', !!show);
  }

  function bindSchemeInputs() {
    $('s-code').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); draft.code = e.target.value; changed(); });
    $('s-name').addEventListener('input', e => { draft.name = e.target.value; changed(); });
    $('s-name').addEventListener('blur', e => { e.target.value = e.target.value.toUpperCase(); draft.name = e.target.value; changed(); });
    $('s-order').addEventListener('input', e => { draft.sort_order = e.target.value; changed(); });
    $('s-active').addEventListener('change', e => { draft.active = e.target.checked; changed(); });
  }

  function init() {
    if (!Engine) { document.body.textContent = 'Could not load the loan charges engine.'; return; }

    $('login-form').addEventListener('submit', onLogin);
    $('btn-logout').addEventListener('click', onLogoutClick);
    $('scheme-search').addEventListener('input', renderSchemeList);
    $('btn-new').addEventListener('click', () => newScheme(null));
    $('btn-new-empty').addEventListener('click', () => newScheme(null));
    $('btn-reveal').addEventListener('click', () => {
      const pw = $('login-password');
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      const btn = $('btn-reveal');
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.title = btn.getAttribute('aria-label');
      btn.querySelector('use').setAttribute('href', show ? '#i-eye-off' : '#i-eye');
      pw.focus();
    });
    $('btn-duplicate').addEventListener('click', () => { const copy = draft; newScheme(copy); });
    $('btn-add-line').addEventListener('click', addLine);
    $('btn-save').addEventListener('click', askSave);
    $('btn-discard').addEventListener('click', discard);
    $('btn-confirm-cancel').addEventListener('click', closeModal);
    $('btn-confirm-save').addEventListener('click', save);
    $('confirm-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
    bindSchemeInputs();

    // Scheme list drawer on narrow screens
    const setSidebar = open => {
      $('sidebar').classList.toggle('sidebar-open', open);
      $('sidebar-backdrop').classList.toggle('active', open);
    };
    $('sidebar-toggle').addEventListener('click', () => setSidebar(!$('sidebar').classList.contains('sidebar-open')));
    $('sidebar-backdrop').addEventListener('click', () => setSidebar(false));
    $('scheme-list').addEventListener('click', () => setSidebar(false));
    $('btn-new').addEventListener('click', () => setSidebar(false));
    $('btn-open-list').addEventListener('click', () => {
      if (getComputedStyle($('sidebar-toggle')).display !== 'none') setSidebar(true);
      $('scheme-search').focus();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('confirm-modal').hidden) closeModal();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && session) { e.preventDefault(); askSave(); }
    });
    ['mousedown', 'keydown', 'touchstart'].forEach(t => document.addEventListener(t, () => { lastActivity = Date.now(); }, { passive: true }));
    setInterval(() => {
      if (session && Date.now() - lastActivity > IDLE_LIMIT_MS) logout('Signed out after 30 minutes of inactivity.');
    }, 30000);
    // Re-fit the scheme list and charge lines whenever their space changes (window resize, fonts, zoom)
    if (window.ResizeObserver) {
      new ResizeObserver(fitSchemeList).observe($('scheme-list').parentElement);
      new ResizeObserver(fitLines).observe(document.querySelector('.lines-scroll'));
    } else {
      window.addEventListener('resize', () => { fitSchemeList(); fitLines(); });
    }
    window.addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

    // Resume a session from this tab, if any
    try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; }
    if (session && session.refresh_token) {
      loader(true);
      checkAdmin()
        .then(startEditor)
        .catch(err => { clearSession(); showLogin(err.notAdmin || err.sessionExpired ? err.message : ''); })
        .finally(() => loader(false));
    } else {
      showLogin();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
