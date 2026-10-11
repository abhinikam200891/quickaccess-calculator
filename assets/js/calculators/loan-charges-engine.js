/**
 * ============================================================================
 * LOAN CHARGES FORMULA ENGINE
 * Evaluates spreadsheet-style scheme definitions in dependency order.
 * Formulas refer to other fields by key (v2, e.g. "amount*1%") or, for the
 * original Google Sheets import (v1), by cell position: the first field is B2,
 * the second B3, ... Formulas are compiled once from a whitelist of tokens,
 * so no arbitrary code from the database can ever be executed.
 * ============================================================================
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['../banking-core'], factory);
  } else if (typeof module === 'object' && module.exports) {
    let BankingCore;
    try {
      BankingCore = require('../banking-core');
    } catch (e) {}
    module.exports = factory(BankingCore);
  } else {
    const engine = factory(root.BankingCore);
    root.BankingLoanChargesEngine = engine;
    if (root.BankingCore) {
      root.BankingCore.calculators = root.BankingCore.calculators || {};
      root.BankingCore.calculators.loanCharges = engine;
    }
  }
})(typeof self !== 'undefined' ? self : this, function (BankingCore) {
  'use strict';

  const FIRST_ROW = 2; // field index 0 is cell B2, as in the source sheet

  // Excel ROUND: half away from zero, exact for values like 1.005; negative digits round to tens/hundreds
  function excelRound(num, digits) {
    if (!isFinite(num)) return 0;
    const d = Math.trunc(digits || 0);
    if (Math.abs(num) >= 1e15 || String(Math.abs(num)).indexOf('e') !== -1) {
      const f = Math.pow(10, d);
      return Math.round(num * f) / f;
    }
    const sign = num < 0 ? -1 : 1;
    return sign * Number(Math.round(Number(Math.abs(num) + 'e' + d)) + 'e' + (-d));
  }

  // Spreadsheet functions available to formulas. Arguments arrive as numbers or booleans.
  const FUNCTIONS = {
    SUM: (...a) => a.reduce((s, x) => s + (Number(x) || 0), 0),
    IF: (c, t, f) => (c ? t : (f === undefined ? false : f)),
    AND: (...a) => a.every(Boolean),
    OR: (...a) => a.some(Boolean),
    NOT: (a) => !a,
    MIN: (...a) => (a.length ? Math.min(...a.map(Number)) : 0),
    MAX: (...a) => (a.length ? Math.max(...a.map(Number)) : 0),
    ROUND: (n, d) => excelRound(Number(n), d),
    ROUNDUP: (n, d) => { const f = Math.pow(10, Math.trunc(d || 0)); return Math.sign(n) * Math.ceil(excelRound(Math.abs(n) * f, 9)) / f; },
    ROUNDDOWN: (n, d) => { const f = Math.pow(10, Math.trunc(d || 0)); return Math.sign(n) * Math.floor(excelRound(Math.abs(n) * f, 9)) / f; },
    MROUND: (n, m) => (m ? excelRound(n / m, 0) * m : 0),
    INT: (n) => Math.floor(n),
    ABS: (n) => Math.abs(n),
    PMT: (rate, nper, pv) => {
      if (!rate) return -(pv / nper);
      const pvif = Math.pow(1 + rate, nper);
      return -((rate * (pv * pvif)) / (pvif - 1));
    }
  };

  const LoanChargesEngine = { version: '2.0.0', FUNCTIONS: FUNCTIONS };

  function cellId(index) {
    return 'B' + (index + FIRST_ROW);
  }

  /**
   * Normalise one field. Accepts both database layouts:
   *  - v1 (loan_fields): type, formula with B2-style cells, options packed in formula, TOTAL row
   *  - v2 (loan_scheme_fields): key, kind, formula with keys, options array, in_total flag
   * @returns {{label:string, type:'input'|'output'|'select', formula:string, defaultValue?:number,
   *            key?:string, options?:Array<{label:string,value:number}>, inTotal?:boolean}}
   */
  LoanChargesEngine.normalizeField = function (raw) {
    const r = raw || {};
    const type = String(r.type || r.kind || 'input').trim().toLowerCase();
    const f = {
      label: String(r.label == null ? '' : r.label).trim(),
      type: (type === 'output' || type === 'select') ? type : 'input',
      formula: r.formula == null ? '' : String(r.formula).trim()
    };
    const dv = r.defaultValue !== undefined ? r.defaultValue : r.default_value;
    if (dv !== null && dv !== undefined && dv !== '' && !isNaN(Number(dv))) f.defaultValue = Number(dv);
    if (r.key) f.key = String(r.key).trim().toUpperCase();
    if (Array.isArray(r.options)) {
      f.options = r.options.map(o => ({ label: String(o.label), value: Number(o.value) || 0 }));
    }
    const inTotal = r.inTotal !== undefined ? r.inTotal : r.in_total;
    if (inTotal !== undefined && inTotal !== null) f.inTotal = Boolean(inTotal);
    return f;
  };

  /** True for the v1 "TOTAL" row (v2 schemes have no total row; see evaluate().total). */
  LoanChargesEngine.isTotal = function (field) {
    return field.inTotal === undefined && /^total/i.test(field.label || '');
  };

  /**
   * Options of a select field: the v2 options array, or the v1 "Label:value, Label:value" formula.
   * @returns {Array<{label:string, value:number}>}
   */
  LoanChargesEngine.parseOptions = function (field) {
    if (field.options && field.options.length) return field.options;
    const raw = field.formula ? String(field.formula) : '';
    if (!raw) return [{ label: 'Default', value: 0 }];
    return raw.split(',').map(s => s.trim()).filter(Boolean).map(opt => {
      const at = opt.lastIndexOf(':');
      const label = (at === -1 ? opt : opt.slice(0, at)).trim();
      const value = Number((at === -1 ? opt : opt.slice(at + 1)).trim());
      return { label: label, value: isNaN(value) ? 0 : value };
    });
  };

  /**
   * Value an editable input starts with (and returns to on reset).
   * Some imported rows keep their default in the formula column (e.g. ADHESIVE = 500).
   * @returns {number|null}
   */
  LoanChargesEngine.initialValue = function (field) {
    if (field.type !== 'input') return null;
    if (field.defaultValue !== undefined) return field.defaultValue;
    if (field.formula !== '' && !isNaN(Number(field.formula))) return Number(field.formula);
    return null;
  };

  // ---------------------------------------------------------------------------
  // Formula compiler
  // ---------------------------------------------------------------------------

  const TOKEN_RE = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_.]*)|(<=|>=|<>|[-+*/^%(),:=<>]))/y;

  function tokenize(src) {
    const tokens = [];
    TOKEN_RE.lastIndex = 0;
    let pos = 0;
    while (pos < src.length) {
      if (/^\s*$/.test(src.slice(pos))) break;
      TOKEN_RE.lastIndex = pos;
      const m = TOKEN_RE.exec(src);
      if (!m) throw new Error('Unexpected character "' + src.slice(pos).trim().charAt(0) + '"');
      if (m[1] !== undefined) tokens.push({ t: 'num', v: m[1] });
      else if (m[2] !== undefined) tokens.push({ t: 'id', v: m[2].toUpperCase() });
      else tokens.push({ t: 'op', v: m[3] });
      pos = TOKEN_RE.lastIndex;
    }
    return tokens;
  }

  const CELL_RE = /^([A-Z]+)(\d+)$/;

  /**
   * Translate one formula into a JavaScript expression over v(index) and F.<FUNCTION>.
   * @param {string} formula
   * @param {Object<string, number>} refs name/cell id -> field index
   * @returns {{js:string, deps:number[]}}
   */
  function translate(formula, refs) {
    let src = String(formula).trim();
    if (src.startsWith('=')) src = src.slice(1);
    if (src === '') return { js: '0', deps: [] };

    const tokens = tokenize(src);
    const deps = new Set();
    const out = [];
    const parens = []; // true when the paren opens a function call

    function ref(name) {
      if (!(name in refs)) throw new Error('Unknown reference ' + name);
      deps.add(refs[name]);
      return 'v(' + refs[name] + ')';
    }

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const next = tokens[i + 1];

      if (tok.t === 'num') {
        out.push(tok.v);
      } else if (tok.t === 'id') {
        if (next && next.t === 'op' && next.v === '(') {
          if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, tok.v)) throw new Error('Unsupported function ' + tok.v);
          out.push('F.' + tok.v + '(');
          parens.push(true);
          i++;
        } else if (tok.v === 'TRUE' || tok.v === 'FALSE') {
          out.push(tok.v.toLowerCase());
        } else if (next && next.t === 'op' && next.v === ':') {
          // Range like B4:B18 -> argument list (only allowed inside a function call)
          const end = tokens[i + 2];
          const a = CELL_RE.exec(tok.v);
          const b = end && end.t === 'id' ? CELL_RE.exec(end.v) : null;
          if (!a || !b || a[1] !== b[1]) throw new Error('Invalid range ' + tok.v + ':' + (end ? end.v : ''));
          if (!parens.length || !parens[parens.length - 1]) throw new Error('Range ' + tok.v + ':' + end.v + ' must be inside a function');
          const lo = Math.min(+a[2], +b[2]);
          const hi = Math.max(+a[2], +b[2]);
          const parts = [];
          for (let r = lo; r <= hi; r++) parts.push(ref(a[1] + r));
          out.push(parts.join(','));
          i += 2;
        } else {
          out.push(ref(tok.v));
        }
      } else {
        switch (tok.v) {
          case '(': out.push('('); parens.push(false); break;
          case ')':
            if (!parens.length) throw new Error('Unbalanced ")"');
            parens.pop(); out.push(')'); break;
          case ',':
            if (!parens.length || !parens[parens.length - 1]) throw new Error('Unexpected ","');
            out.push(','); break;
          case '%': out.push('/100'); break;
          case '=': out.push('==='); break;
          case '<>': out.push('!=='); break;
          case '^': out.push('**'); break;
          case ':': throw new Error('Unexpected ":"');
          default: out.push(tok.v);
        }
      }
    }
    if (parens.length) throw new Error('Missing ")"');
    return { js: out.join(' '), deps: Array.from(deps) };
  }

  /**
   * Compile a scheme once; evaluate it many times.
   * @param {Array<Object>} rawFields scheme rows in sheet order
   * @returns {{fields:Array, errors:Object<number,string>, evaluate:Function}}
   */
  LoanChargesEngine.compile = function (rawFields) {
    const fields = (rawFields || []).map(LoanChargesEngine.normalizeField);
    // v2 schemes name every field; then sheet positions (B3) are not valid references,
    // so moving a row can never silently change a formula.
    const named = fields.length > 0 && fields.every(f => f.key);
    const refs = {};
    fields.forEach((f, i) => {
      if (named) refs[f.key] = i;
      else refs[cellId(i)] = i;
    });

    const errors = {};
    const fns = {};
    const deps = {};

    fields.forEach((f, i) => {
      if (f.type !== 'output') return;
      try {
        const t = translate(f.formula, refs);
        // Safe: the expression only contains numbers, operators, v(n) and whitelisted F.* calls
        fns[i] = new Function('v', 'F', '"use strict"; return (' + t.js + ');');
        deps[i] = t.deps;
      } catch (e) {
        errors[i] = e.message;
      }
    });

    // Order outputs so every field is evaluated after the outputs it depends on
    const order = [];
    const state = {}; // 1 = visiting, 2 = done
    function visit(i) {
      if (state[i] === 2) return true;
      if (state[i] === 1) return false;
      state[i] = 1;
      for (const d of deps[i] || []) {
        if (fns[d] && !visit(d)) {
          errors[i] = errors[i] || 'Circular reference';
          state[i] = 2;
          return false;
        }
      }
      state[i] = 2;
      order.push(i);
      return true;
    }
    Object.keys(fns).map(Number).forEach(visit);

    return {
      fields: fields,
      errors: errors,
      /**
       * @param {Object<number, number>} inputs values of input/select fields by index
       * @returns {{values:number[], errors:Object<number,string>, total:number|null}}
       */
      evaluate: function (inputs) {
        const values = fields.map((f, i) => {
          if (f.type === 'output') return 0;
          const n = Number(inputs && inputs[i]);
          return isNaN(n) ? 0 : n;
        });
        const runErrors = Object.assign({}, errors);
        const v = (i) => values[i];

        order.forEach(i => {
          if (runErrors[i]) return;
          try {
            let r = fns[i](v, FUNCTIONS);
            if (typeof r === 'boolean') r = r ? 1 : 0;
            r = Number(r);
            if (!isFinite(r)) { runErrors[i] = 'Result is not a number'; r = 0; }
            values[i] = r;
          } catch (e) {
            runErrors[i] = e.message;
          }
        });

        let total = null;
        if (fields.some(f => f.inTotal !== undefined)) {
          total = fields.reduce((s, f, i) => s + (f.inTotal ? values[i] : 0), 0);
        } else {
          const totalIdx = fields.findIndex(LoanChargesEngine.isTotal);
          if (totalIdx !== -1) total = values[totalIdx];
        }
        return { values: values, errors: runErrors, total: total };
      }
    };
  };

  return LoanChargesEngine;
});
