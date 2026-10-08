/**
 * ============================================================================
 * LAKHPATI RD PENALTY CALCULATION ENGINE
 * Recurring Deposit (RD) step-ladder penalty matrix for missed installments
 * and cumulative arrears audit.
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
    root.BankingLakhpatiEngine = engine;
    if (root.BankingCore) {
      root.BankingCore.calculators = root.BankingCore.calculators || {};
      root.BankingCore.calculators.lakhpati = engine;
    }
  }
})(typeof self !== 'undefined' ? self : this, function (BankingCore) {
  'use strict';

  const LakhpatiEngine = {
    version: '1.0.0',
    DEFAULT_CONFIG: {
      defaultPenaltyRate: 2.0
    }
  };

  /**
   * Calculate calendar months difference between two dates
   * @param {Date|string} d1 Start date
   * @param {Date|string} d2 End date
   * @returns {number}
   */
  LakhpatiEngine.getMonthDifference = function (d1, d2) {
    let date1 = d1 instanceof Date ? d1 : (BankingCore && BankingCore.dates ? BankingCore.dates.parse(d1) : new Date(d1));
    let date2 = d2 instanceof Date ? d2 : (BankingCore && BankingCore.dates ? BankingCore.dates.parse(d2) : new Date(d2));
    if (!date1 || !date2 || isNaN(date1.getTime()) || isNaN(date2.getTime())) return 0;

    let months = (date2.getFullYear() - date1.getFullYear()) * 12;
    months -= date1.getMonth();
    months += date2.getMonth();
    return months <= 0 ? 0 : months;
  };

  /**
   * Compute live expectation statistics
   * @param {Object} params
   * @returns {Object}
   */
  LakhpatiEngine.getStats = function (params) {
    const openDate = params.openDate;
    const refDate = params.refDate || new Date();
    const monthlyAmount = BankingCore ? BankingCore.parseAmount(params.monthlyAmount) : parseFloat(params.monthlyAmount) || 0;
    const receivedAmount = BankingCore ? BankingCore.parseAmount(params.receivedAmount) : parseFloat(params.receivedAmount) || 0;

    const totalMonthsPassed = LakhpatiEngine.getMonthDifference(openDate, refDate);
    const expectedTotal = totalMonthsPassed * monthlyAmount;
    const outstanding = Math.max(0, expectedTotal - receivedAmount);
    const skippedRaw = monthlyAmount > 0 ? outstanding / monthlyAmount : 0;
    const skippedRounded = Math.round(skippedRaw);

    return {
      totalMonthsPassed,
      expectedTotal,
      outstanding,
      skippedRaw,
      skippedRounded
    };
  };

  /**
   * Main Calculation for Lakhpati RD Penalty
   * @param {Object} params
   * @param {Date|string} params.openDate Account opening date
   * @param {number|string} params.monthlyAmount Monthly installment amount
   * @param {number|string} params.rate Penalty rate % (e.g. 2.0)
   * @param {number|string} [params.receivedAmount=0] Actual amount collected so far
   * @param {number} [params.skippedCount] Override for number of skipped installments
   * @param {Date|string} [params.refDate] Reference calculation date (defaults to today)
   * @returns {Object}
   */
  LakhpatiEngine.calculate = function (params) {
    try {
      if (!params) throw new Error("Parameters required.");
      const monthlyAmount = BankingCore ? BankingCore.parseAmount(params.monthlyAmount) : parseFloat(params.monthlyAmount);
      const rate = typeof params.rate === 'number' ? params.rate : parseFloat(params.rate);
      const receivedAmount = BankingCore ? BankingCore.parseAmount(params.receivedAmount) : (parseFloat(params.receivedAmount) || 0);
      const openDate = params.openDate;
      const refDate = params.refDate || new Date();

      if (isNaN(monthlyAmount) || monthlyAmount <= 0) {
        return { ok: false, error: "Please enter a valid monthly installment amount." };
      }
      if (isNaN(rate) || rate < 0) {
        return { ok: false, error: "Please enter a valid penalty rate." };
      }
      if (!openDate) {
        return { ok: false, error: "Please select Account Opening Date." };
      }

      const totalMonthsPassed = LakhpatiEngine.getMonthDifference(openDate, refDate);
      const expectedTotal = totalMonthsPassed * monthlyAmount;

      let skippedCount;
      if (params.skippedCount !== undefined && params.skippedCount !== null && !isNaN(params.skippedCount)) {
        skippedCount = parseInt(params.skippedCount, 10);
      } else {
        const outstanding = Math.max(0, expectedTotal - receivedAmount);
        skippedCount = monthlyAmount > 0 ? Math.round(outstanding / monthlyAmount) : 0;
      }
      if (skippedCount < 0) skippedCount = 0;

      const rateDecimal = rate / 100;
      let totalPenalty = 0;
      const installments = [];

      for (let i = 1; i <= skippedCount; i++) {
        const outstandingForThisMonth = monthlyAmount * i;
        const penaltyForThisMonth = outstandingForThisMonth * rateDecimal;
        totalPenalty += penaltyForThisMonth;

        installments.push({
          index: i,
          title: `Inst ${i}`,
          outstanding: outstandingForThisMonth,
          penalty: penaltyForThisMonth
        });
      }

      const round = (val, dec = 2) => BankingCore ? BankingCore.round(val, dec) : Math.round(val * 100) / 100;

      const roundedPenalty = round(totalPenalty, 2);
      const pendingPrincipal = round(Math.max(0, expectedTotal - receivedAmount), 2);
      const grandTotal = round(pendingPrincipal + roundedPenalty, 2);

      return {
        ok: true,
        monthlyAmount: monthlyAmount,
        rate: rate,
        receivedAmount: receivedAmount,
        totalMonthsPassed: totalMonthsPassed,
        expectedTotal: round(expectedTotal, 2),
        pendingPrincipal: pendingPrincipal,
        skippedCount: skippedCount,
        totalPenalty: roundedPenalty,
        grandTotal: grandTotal,
        installments: installments
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  return LakhpatiEngine;
});
