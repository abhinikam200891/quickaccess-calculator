/**
 * ============================================================================
 * ARB SAMOPCHAR (D1) COMPROMISE SETTLEMENT ENGINE
 * Cooperative Banking Section 101/91 Dispute Settlement, NPA to D1 chronology,
 * and three-tier comparative recovery appraisal.
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
    root.BankingArbSamopcharEngine = engine;
    if (root.BankingCore) {
      root.BankingCore.calculators = root.BankingCore.calculators || {};
      root.BankingCore.calculators.arbSamopchar = engine;
    }
  }
})(typeof self !== 'undefined' ? self : this, function (BankingCore) {
  'use strict';

  const ArbSamopcharEngine = {
    version: '1.0.0',
    DEFAULT_CONFIG: {
      defaultCostOfProcessRate: 0.75, // 0.75%
      dayBasis: 36500 // (P * R * Days) / 36500
    }
  };

  /**
   * Parse arbitrary date into a Date object
   * @param {Date|string} val
   * @returns {Date|null}
   */
  function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'string') {
      const parts = val.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) { // YYYY-MM-DD
          const y = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, d = parseInt(parts[2], 10);
          const dt = new Date(y, m, d);
          return (dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d) ? dt : null;
        } else { // DD-MM-YYYY
          const d = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, y = parseInt(parts[2], 10);
          const dt = new Date(y, m, d);
          return (dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d) ? dt : null;
        }
      }
    }
    if (BankingCore && BankingCore.dates && BankingCore.dates.parse) {
      return BankingCore.dates.parse(val);
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Compute D1 Date (NPA Date + 12 Months / 1 Year)
   * @param {Date|string} npaDate
   * @returns {Date|null}
   */
  ArbSamopcharEngine.computeD1Date = function (npaDate) {
    const npa = parseDate(npaDate);
    if (!npa) return null;
    return new Date(npa.getFullYear() + 1, npa.getMonth(), npa.getDate());
  };

  /**
   * Format date as DD-MM-YYYY
   * @param {Date|string} date
   * @returns {string}
   */
  ArbSamopcharEngine.formatDMY = function (date) {
    const d = parseDate(date);
    if (!d) return '-';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
  };

  /**
   * Compute Overdue Days (Prastav Date - D1 Date)
   * @param {Date|string} npaDate
   * @param {Date|string} prastavDate
   * @returns {number}
   */
  ArbSamopcharEngine.computeOverdueDays = function (npaDate, prastavDate) {
    const d1 = ArbSamopcharEngine.computeD1Date(npaDate);
    const prastav = parseDate(prastavDate);
    if (!d1 || !prastav) return 0;
    return Math.max(0, Math.floor((prastav.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  };

  /**
   * Calculate a single column/tier
   * @param {Object} col
   * @param {number} overdueDays
   * @param {number} costOfProcessRate
   * @returns {Object}
   */
  ArbSamopcharEngine.calculateColumn = function (col, overdueDays = 0, costOfProcessRate = 0.75) {
    const parse = (v) => BankingCore ? BankingCore.parseAmount(v) : (parseFloat(v) || 0);
    const round = (v, d = 2) => BankingCore ? BankingCore.round(v, d) : Math.round(v * 100) / 100;

    const rate = parseFloat(col.rate) || 0;
    const principal = parse(col.principal);
    const intPrastav = parse(col.intPrastav);
    const otherCharges = parse(col.otherCharges);
    const insurance = parse(col.insurance);
    const receivedAfterD1 = parse(col.receivedAfterD1);

    const amtD1 = principal + intPrastav + otherCharges;
    const totInt = (principal * rate * overdueDays) / 36500;
    const receivable = amtD1 + totInt;
    const amtD1Calc = receivable + insurance - receivedAfterD1;
    const costOfProcessAmt = (amtD1Calc * (costOfProcessRate / 100));
    const totalPayable = amtD1Calc + costOfProcessAmt;

    return {
      rate: rate,
      principal: principal,
      intPrastav: intPrastav,
      otherCharges: otherCharges,
      insurance: insurance,
      receivedAfterD1: receivedAfterD1,
      amtD1: round(amtD1, 2),
      overdueDays: overdueDays,
      totInt: round(totInt, 2),
      receivable: round(receivable, 2),
      amtD1Calc: round(amtD1Calc, 2),
      costOfProcessAmt: round(costOfProcessAmt, 2),
      totalPayable: round(totalPayable, 2)
    };
  };

  /**
   * Full Settlement Matrix Calculation
   * @param {Object} params
   * @param {Date|string} params.npaDate
   * @param {Date|string} params.prastavDate
   * @param {number} [params.costOfProcessRate=0.75]
   * @param {Array<Object>} params.columns Array of 3 column parameter objects
   * @returns {Object}
   */
  ArbSamopcharEngine.calculate = function (params) {
    try {
      if (!params) throw new Error("Parameters required.");
      const npaDate = params.npaDate;
      const prastavDate = params.prastavDate;
      const cpRate = params.costOfProcessRate !== undefined ? parseFloat(params.costOfProcessRate) || 0 : ArbSamopcharEngine.DEFAULT_CONFIG.defaultCostOfProcessRate;

      const d1Obj = ArbSamopcharEngine.computeD1Date(npaDate);
      const overdueDays = ArbSamopcharEngine.computeOverdueDays(npaDate, prastavDate);

      const columnsInput = params.columns || [];
      const columnResults = columnsInput.map(col => ArbSamopcharEngine.calculateColumn(col, overdueDays, cpRate));

      return {
        ok: true,
        d1Date: d1Obj,
        d1DateFormatted: ArbSamopcharEngine.formatDMY(d1Obj),
        overdueDays: overdueDays,
        costOfProcessRate: cpRate,
        columns: columnResults
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  return ArbSamopcharEngine;
});
