/**
 * ============================================================================
 * DIVIDEND CALCULATION ENGINE
 * Shareholder pro-rata dividend calculation adhering to Cooperative Banking
 * Society Bylaws (calendar month of allotment/resignation excluded).
 * ============================================================================
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['../banking-core'], factory);
  } else if (typeof module === 'object' && module.exports) {
    let BankingCore;
    try {
      BankingCore = require('../banking-core');
    } catch (e) {
      // In case path is different
    }
    module.exports = factory(BankingCore);
  } else {
    const engine = factory(root.BankingCore);
    root.BankingDividendEngine = engine;
    if (root.BankingCore) {
      root.BankingCore.calculators = root.BankingCore.calculators || {};
      root.BankingCore.calculators.dividend = engine;
    }
  }
})(typeof self !== 'undefined' ? self : this, function (BankingCore) {
  'use strict';

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const DividendEngine = {
    version: '1.0.0',
    DEFAULT_CONFIG: {
      fyStartMonth: 3, // 0-indexed, 3 = April
      excludeTransactionMonth: true,
      annualMonths: 12
    }
  };

  /**
   * Calculate Pro-rata Dividend Breakdown & Total
   * @param {Object} params
   * @param {string} params.type 'new' | 'additional' | 'resigned'
   * @param {number|string} params.rate Annual dividend rate percentage (e.g. 12)
   * @param {number|string} params.amount Share allotment or total balance amount
   * @param {Date|string} params.actionDate Date of allotment or resignation
   * @param {number|string} [params.existingAmount=0] Opening share capital (for 'additional')
   * @param {Object} [options] Optional config overrides
   * @returns {Object} { ok, totalDividend, interestAction, interestExisting, monthsCount, skipMonth, periodDesc, items, error }
   */
  DividendEngine.calculate = function (params, options = {}) {
    try {
      if (!params) throw new Error("Parameters required.");
      const type = params.type || 'new';
      const rate = typeof params.rate === 'number' ? params.rate : parseFloat(params.rate);
      const amount = typeof params.amount === 'number' ? params.amount : parseFloat(params.amount);
      const existingAmount = parseFloat(params.existingAmount) || 0;

      if (isNaN(rate) || rate < 0) {
        return { ok: false, error: "Invalid dividend rate." };
      }
      if (isNaN(amount) || amount <= 0) {
        return { ok: false, error: "Invalid share amount." };
      }
      if (!params.actionDate) {
        return { ok: false, error: "Date is required." };
      }

      let dateObj;
      if (params.actionDate instanceof Date) {
        dateObj = params.actionDate;
      } else if (BankingCore && BankingCore.dates && BankingCore.dates.parse) {
        dateObj = BankingCore.dates.parse(params.actionDate);
      } else {
        dateObj = new Date(params.actionDate);
      }

      if (!dateObj || isNaN(dateObj.getTime())) {
        return { ok: false, error: "Invalid date format." };
      }

      const monthIndex = dateObj.getMonth();
      const skipDesc = MONTH_NAMES[monthIndex];

      // Financial year index: Apr(3) -> 0, May(4) -> 1, ..., Mar(2) -> 11
      const fyIndex = (monthIndex >= 3) ? (monthIndex - 3) : (monthIndex + 9);
      let monthsCount = 0;
      let periodDesc = "None";

      if (type === 'resigned') {
        monthsCount = fyIndex;
        if (monthsCount > 0) {
          const lastEligibleMonth = (monthIndex + 11) % 12;
          periodDesc = `Apr - ${MONTH_NAMES[lastEligibleMonth]}`;
        }
      } else {
        monthsCount = 11 - fyIndex;
        if (monthsCount < 0) monthsCount = 0;
        if (monthsCount > 0) {
          const firstEligibleMonth = (monthIndex + 1) % 12;
          periodDesc = `${MONTH_NAMES[firstEligibleMonth]} - Mar`;
        }
      }

      const round = (val) => BankingCore ? BankingCore.round(val, 2) : Math.round(val * 100) / 100;

      const interestAction = round(amount * (rate / 100) * (monthsCount / 12));
      let interestExisting = 0;
      if (type === 'additional') {
        interestExisting = round(existingAmount * (rate / 100));
      }

      const totalDividend = round(interestAction + interestExisting);

      const items = [];
      if (type === 'additional' && existingAmount > 0) {
        items.push({
          type: 'opening',
          title: 'Opening Balance',
          principal: existingAmount,
          rate: rate,
          months: 12,
          interest: interestExisting,
          formula: `${existingAmount} × ${rate}% × 12/12`,
          periodDesc: 'Full Year (12 Mo)'
        });
      }

      let actionTitle = (type === 'resigned') ? 'Resignation Payout' : (type === 'additional' ? 'Additional Allotment' : 'New Allotment');
      items.push({
        type: type,
        title: actionTitle,
        principal: amount,
        rate: rate,
        months: monthsCount,
        skipMonth: skipDesc,
        interest: interestAction,
        formula: `${amount} × ${rate}% × ${monthsCount}/12`,
        periodDesc: periodDesc
      });

      return {
        ok: true,
        type: type,
        rate: rate,
        amount: amount,
        existingAmount: existingAmount,
        actionDate: dateObj,
        monthsCount: monthsCount,
        skipMonth: skipDesc,
        periodDesc: periodDesc,
        interestAction: interestAction,
        interestExisting: interestExisting,
        totalDividend: totalDividend,
        items: items
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  return DividendEngine;
});
