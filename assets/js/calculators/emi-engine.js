/**
 * ============================================================================
 * EMI (REDUCING BALANCE) ENGINE
 * Monthly instalment rounded to the rupee, interest per month rounded to the
 * rupee, and a final instalment that clears the remaining balance exactly.
 * ============================================================================
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['../banking-core'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../banking-core'));
  } else {
    const engine = factory(root.BankingCore);
    root.BankingEmiEngine = engine;
    if (root.BankingCore) {
      root.BankingCore.calculators = root.BankingCore.calculators || {};
      root.BankingCore.calculators.emi = engine;
    }
  }
})(typeof self !== 'undefined' ? self : this, function (BankingCore) {
  'use strict';

  const EmiEngine = { version: '1.0.0' };

  /**
   * @param {Object} params
   * @param {number|string} params.principal Loan amount (₹)
   * @param {number|string} params.annualRate Interest % p.a. (0 = interest-free)
   * @param {number|string} params.months Tenure in months
   * @returns {{ok:boolean, error?:string, emi:number, monthlyRate:number,
   *            schedule:Array<{month:number, principal:number, interest:number, total:number, balance:number}>,
   *            totalPrincipal:number, totalInterest:number, totalPayment:number}}
   */
  EmiEngine.calculate = function (params) {
    const P = BankingCore.parseAmount(params.principal);
    const annualRate = parseFloat(params.annualRate) || 0;
    const n = parseInt(params.months, 10) || 0;

    if (P <= 0) return { ok: false, error: 'Enter a loan amount.' };
    if (n <= 0) return { ok: false, error: 'Enter the tenure in months.' };
    if (annualRate < 0) return { ok: false, error: 'Interest rate cannot be negative.' };

    const r = annualRate > 0 ? annualRate / 12 / 100 : 0;
    let emi;
    if (r > 0) {
      const factor = Math.pow(1 + r, n);
      emi = BankingCore.round(P * r * (factor / (factor - 1)), 0);
    } else {
      emi = BankingCore.round(P / n, 0);
    }

    const schedule = [];
    let balance = P;
    let totalPrincipal = 0;
    let totalInterest = 0;

    for (let i = 1; i <= n; i++) {
      const interest = BankingCore.round(balance * r, 0);
      let principal = emi - interest;

      // The last instalment (or an earlier one that would overpay) clears the balance exactly
      if (i === n || balance - principal < 0) {
        principal = balance;
        balance = 0;
      } else {
        balance = balance - principal;
      }

      totalPrincipal += principal;
      totalInterest += interest;
      schedule.push({ month: i, principal: principal, interest: interest, total: principal + interest, balance: balance });
    }

    return {
      ok: true,
      emi: emi,
      monthlyRate: r,
      schedule: schedule,
      totalPrincipal: totalPrincipal,
      totalInterest: totalInterest,
      totalPayment: totalPrincipal + totalInterest
    };
  };

  return EmiEngine;
});
