/**
 * ============================================================================
 * ARB SAVLAT (COMPROMISE DISCOUNT) AUDIT & OVERDUE INTEREST ENGINE
 * Checks that the discount given at closure stays within the sanctioned
 * prastav discount, and computes simple overdue interest on a 365-day basis.
 * ============================================================================
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['../banking-core'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../banking-core'));
  } else {
    const engine = factory(root.BankingCore);
    root.BankingArbOverdueEngine = engine;
    if (root.BankingCore) {
      root.BankingCore.calculators = root.BankingCore.calculators || {};
      root.BankingCore.calculators.arbOverdue = engine;
    }
  }
})(typeof self !== 'undefined' ? self : this, function (BankingCore) {
  'use strict';

  const ArbOverdueEngine = {
    version: '1.0.0',
    DEFAULT_CONFIG: {
      dayBasis: 365 // simple interest: principal × days / 365 × rate%
    }
  };

  /**
   * Savlat audit: discount at closure must not exceed the prastav (sanctioned) discount.
   * @param {Object} p
   * @param {number|string} p.balancePrastav  Outstanding balance in the prastav
   * @param {number|string} p.sanctionAmount  Settlement amount sanctioned in the prastav
   * @param {number|string} p.amountReceived  Amount actually received
   * @param {number|string} p.closingBalance  Outstanding balance on the closing date
   * @returns {{prastavDiscount:number, closingDiscount:number, withinLimit:boolean}}
   */
  ArbOverdueEngine.auditSavlat = function (p) {
    const prastavDiscount = BankingCore.parseAmount(p.balancePrastav) - BankingCore.parseAmount(p.sanctionAmount);
    const closingDiscount = BankingCore.parseAmount(p.closingBalance) - BankingCore.parseAmount(p.amountReceived);
    return {
      prastavDiscount: BankingCore.round(prastavDiscount, 2),
      closingDiscount: BankingCore.round(closingDiscount, 2),
      withinLimit: closingDiscount <= prastavDiscount
    };
  };

  /**
   * Simple overdue interest from the sanction date up to (excluding) the "as on" date.
   * @param {Object} p
   * @param {number|string} p.principal
   * @param {number|string} p.rate  % p.a.
   * @param {Date|string} p.fromDate  Sanction date
   * @param {Date|string} [p.toDate]  Defaults to today
   * @returns {{ok:boolean, error?:string, days:number, interest:number}}
   */
  ArbOverdueEngine.overdueInterest = function (p) {
    const principal = BankingCore.parseAmount(p.principal);
    const rate = parseFloat(p.rate);
    const from = BankingCore.dates.parse(p.fromDate);
    const to = BankingCore.dates.parse(p.toDate || new Date());

    if (!from) return { ok: false, error: 'Enter the sanction date.' };
    if (!(principal > 0)) return { ok: false, error: 'Enter the principal amount.' };
    if (isNaN(rate) || rate < 0) return { ok: false, error: 'Enter a valid interest rate.' };

    const days = BankingCore.dates.daysBetween(from, to);
    if (days < 0) return { ok: false, error: 'Sanction date cannot be in the future!' };

    const interest = BankingCore.round(principal * (days / ArbOverdueEngine.DEFAULT_CONFIG.dayBasis) * (rate / 100), 2);
    return { ok: true, days: days, interest: interest };
  };

  return ArbOverdueEngine;
});
