/**
 * ============================================================================
 * EMI (DAILY BASED) REDUCING BALANCE ENGINE
 * Simulates daily-based reducing balance repayment against actual calendar
 * month day counts (28-31 days) and compares against regular monthly EMI.
 * ============================================================================
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['../banking-core'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../banking-core'));
  } else {
    const engine = factory(root.BankingCore);
    root.BankingEmiDailyEngine = engine;
    if (root.BankingCore) {
      root.BankingCore.calculators = root.BankingCore.calculators || {};
      root.BankingCore.calculators.emiDaily = engine;
    }
  }
})(typeof self !== 'undefined' ? self : this, function (BankingCore) {
  'use strict';

  const EmiDailyEngine = {
    version: '1.0.0'
  };

  /**
   * Formats duration in months into human-readable words:
   * e.g. 43 -> "3 Years 7 Months", 12 -> "1 Year", 5 -> "5 Months"
   * @param {number} totalMonths
   * @returns {string}
   */
  EmiDailyEngine.formatDuration = function (totalMonths) {
    const m = parseInt(totalMonths, 10);
    if (!m || m <= 0) return '0 Months';
    const years = Math.floor(m / 12);
    const remainingMonths = m % 12;
    const parts = [];
    if (years > 0) parts.push(years === 1 ? '1 Year' : `${years} Years`);
    if (remainingMonths > 0) parts.push(remainingMonths === 1 ? '1 Month' : `${remainingMonths} Months`);
    return parts.join(' ') || '0 Months';
  };

  /**
   * Calculates the full daily-based reducing balance schedule and comparisons.
   *
   * @param {Object} params
   * @param {number|string} params.principal Loan amount borrowed (₹)
   * @param {number|string} params.tenureMonths Scheduled loan tenure in months
   * @param {number|string} params.dailyPayment Daily repayment commitment (₹/day)
   * @param {number|string} params.annualRate Annual interest rate (% p.a.)
   * @param {number|string|Date} [params.startDate] Commencement date (e.g. "2026-04" or Date)
   * @returns {Object} Comprehensive calculation result
   */
  EmiDailyEngine.calculate = function (params) {
    const P = BankingCore ? BankingCore.parseAmount(params.principal) : (parseFloat(params.principal) || 0);
    const n = parseInt(params.tenureMonths, 10) || 0;
    const D = BankingCore ? BankingCore.parseAmount(params.dailyPayment) : (parseFloat(params.dailyPayment) || 0);
    let annualRate = parseFloat(params.annualRate);
    if (isNaN(annualRate)) annualRate = 0;

    if (P <= 0) return { ok: false, error: 'Please enter a valid loan amount.' };
    if (n <= 0) return { ok: false, error: 'Please enter a valid loan tenure in months.' };
    if (D <= 0) return { ok: false, error: 'Please enter a valid daily payment amount.' };
    if (annualRate < 0) return { ok: false, error: 'Interest rate cannot be negative.' };

    // Resolve start year and month
    let startYear, startMonth;
    if (params.startDate instanceof Date && !isNaN(params.startDate.getTime())) {
      startYear = params.startDate.getFullYear();
      startMonth = params.startDate.getMonth();
    } else if (typeof params.startDate === 'string' && params.startDate.trim()) {
      const parts = params.startDate.trim().split(/[-/]/).map(Number);
      if (parts.length >= 2) {
        startYear = parts[0];
        startMonth = parts[1] - 1; // 0-indexed
      }
    }

    if (!startYear || isNaN(startYear) || startMonth === undefined || isNaN(startMonth)) {
      const now = new Date();
      startYear = now.getFullYear();
      startMonth = now.getMonth();
    }

    const r = (annualRate / 100) / 12;
    let currentBalance = P;
    const rows = [];
    let totalInterestPaid = 0;
    let totalAmountPaid = 0;
    let payoffMonth = null;
    const maxSimulationMonths = 400;

    for (let monthIndex = 1; monthIndex <= maxSimulationMonths; monthIndex++) {
      const monthDate = new Date(startYear, startMonth + monthIndex - 1, 1);
      const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

      let monthlyInterest = 0;
      let actualPayment = 0;

      if (monthIndex <= n && currentBalance > 0) {
        monthlyInterest = currentBalance * r;
        actualPayment = Math.min(D * daysInMonth, currentBalance + monthlyInterest);
      }

      const closingBalance = Math.max(0, currentBalance + monthlyInterest - actualPayment);

      rows.push({
        m: monthIndex,
        date: monthDate,
        days: daysInMonth,
        open: currentBalance,
        int: monthlyInterest,
        pay: actualPayment,
        close: closingBalance
      });

      totalInterestPaid += monthlyInterest;
      totalAmountPaid += actualPayment;

      if (closingBalance === 0 && payoffMonth === null && monthIndex <= n) {
        payoffMonth = monthIndex;
      }

      currentBalance = closingBalance;
    }

    // Standard fixed monthly EMI baseline
    const standardEMI = P > 0 && n > 0
      ? (r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n)))
      : 0;

    const standardEMITotalInterest = Math.max(0, (standardEMI * n) - P);
    const tenureEndIndex = Math.min(n, maxSimulationMonths) - 1;
    const balanceAfterTenure = rows[tenureEndIndex] ? rows[tenureEndIndex].close : P;
    const interestSaved = standardEMITotalInterest - totalInterestPaid;

    // Check status conditions
    const m1Days = rows[0].days;
    const m1Interest = P * r;
    const m1Payment = D * m1Days;
    const isUnderpaying = m1Payment < m1Interest;

    // Aggregate Yearly Schedule
    const yearlyRows = [];
    const totalSimulatedMonths = payoffMonth || n;
    const totalYears = Math.ceil(totalSimulatedMonths / 12);

    for (let y = 1; y <= totalYears; y++) {
      const slice = rows.slice((y - 1) * 12, Math.min(y * 12, totalSimulatedMonths));
      if (!slice.length) continue;
      const openB = slice[0].open;
      const closeB = slice[slice.length - 1].close;
      const sumInt = slice.reduce((acc, row) => acc + row.int, 0);
      const sumPay = slice.reduce((acc, row) => acc + row.pay, 0);
      yearlyRows.push({
        year: y,
        startDate: slice[0].date,
        endDate: slice[slice.length - 1].date,
        open: openB,
        int: sumInt,
        pay: sumPay,
        close: closeB
      });
    }

    return {
      ok: true,
      P: P,
      N: n,
      D: D,
      monthlyEquivalent: (D * 365) / 12,
      R: annualRate,
      monthlyRate: r,
      startDate: new Date(startYear, startMonth, 1),
      rows: rows,
      yearlyRows: yearlyRows,
      totInt: totalInterestPaid,
      totPaid: totalAmountPaid,
      closeM: payoffMonth,
      emi: standardEMI,
      emiInt: standardEMITotalInterest,
      balAfterN: balanceAfterTenure,
      diff: interestSaved,
      isUnderpaying: isUnderpaying,
      m1Interest: m1Interest,
      m1Payment: m1Payment,
      durationText: EmiDailyEngine.formatDuration(payoffMonth || n)
    };
  };

  return EmiDailyEngine;
});

