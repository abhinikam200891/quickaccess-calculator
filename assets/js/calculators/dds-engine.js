/**
 * ============================================================================
 * DDS (DAILY DEPOSIT SCHEME) PIGMY INTEREST ENGINE
 * High-precision interest calculations, gap-filling audit trails,
 * 30/31-day interest deposit caps, 3% commission deductions, and modified balance rules.
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
    root.BankingDdsEngine = engine;
    if (root.BankingCore) {
      root.BankingCore.calculators = root.BankingCore.calculators || {};
      root.BankingCore.calculators.dds = engine;
    }
  }
})(typeof self !== 'undefined' ? self : this, function (BankingCore) {
  'use strict';

  const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const DdsEngine = {
    version: '1.0.0',
    DEFAULT_CONFIG: {
      minDurationMonths: 6,
      minDurationDays: 1,
      shortTermRate: 2.0, // <= 12 months
      longTermRate: 5.0,  // > 12 months
      commissionRate: 0.03, // 3%
      commissionCutoffMonths: 6, // Last 6 months relative to withdrawal
      interestDaysCapRule: true // 30-day month -> 31-day cap
    }
  };

  /**
   * Helper to parse date
   */
  function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (BankingCore && BankingCore.dates && BankingCore.dates.parse) {
      return BankingCore.dates.parse(val);
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Helper to get End of Month Date
   */
  DdsEngine.getEndOfMonth = function (year, monthIndex) {
    return new Date(year, monthIndex + 1, 0);
  };

  /**
   * Calculate duration between start date and end date
   * @param {Date|string} startStr
   * @param {Date|string} endDateObj
   * @returns {Object} { ok, totalMonths, days, text, msg }
   */
  DdsEngine.calcDuration = function (startStr, endDateObj) {
    if (!startStr) return { ok: false, msg: "Start Date Required" };
    if (!endDateObj) return { ok: false, msg: "Withdrawal Date Required" };

    const start = parseDate(startStr);
    const end = parseDate(endDateObj);

    if (!start) return { ok: false, msg: "Invalid Start Date" };
    if (!end) return { ok: false, msg: "Invalid Withdrawal Date" };

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (start > end) return { ok: false, msg: "Opening Date cannot be after Withdrawal Date" };

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months--;
      days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    const totalMonths = (years * 12) + months;
    return { ok: true, totalMonths, days, text: `${totalMonths} Mths, ${days} Days` };
  };

  /**
   * Validate duration against policy rules
   */
  DdsEngine.validatePolicy = function (duration, config = {}) {
    const minM = config.minDurationMonths !== undefined ? config.minDurationMonths : DdsEngine.DEFAULT_CONFIG.minDurationMonths;
    const minD = config.minDurationDays !== undefined ? config.minDurationDays : DdsEngine.DEFAULT_CONFIG.minDurationDays;

    if (!duration.ok) return { valid: false, error: duration.msg };
    if (duration.totalMonths < minM || (duration.totalMonths === minM && duration.days < minD)) {
      return { valid: false, error: `Policy Constraint: Minimum duration is ${minM} Months & ${minD} Day.` };
    }
    return { valid: true };
  };

  /**
   * Determine interest rate based on tenure
   */
  DdsEngine.getRate = function (totalMonths, days, config = {}) {
    const shortRate = config.shortTermRate !== undefined ? config.shortTermRate : DdsEngine.DEFAULT_CONFIG.shortTermRate;
    const longRate = config.longTermRate !== undefined ? config.longTermRate : DdsEngine.DEFAULT_CONFIG.longTermRate;

    return (totalMonths > 12 || (totalMonths === 12 && days > 0)) ? longRate : shortRate;
  };

  /**
   * Normalize and fill gaps across transaction records
   * @param {Array<Object>} rows Array with { POSTDATE, Deposits, Withdrawals, Balance, Balance_1 }
   * @param {Date} userDate Opening Date
   * @param {Date} withdrawalDate Withdrawal Date
   * @returns {Object} { openingBal, finalTxRows }
   */
  DdsEngine.prepareTransactions = function (rows, userDate, withdrawalDate) {
    const validRows = rows
      .filter(r => {
        if (!r.POSTDATE) return false;
        const rDate = parseDate(r.POSTDATE);
        return rDate && !isNaN(rDate) && rDate <= withdrawalDate;
      })
      .sort((a, b) => new Date(a.POSTDATE) - new Date(b.POSTDATE));

    let runningBalance = 0;
    let openingBal = 0;
    let lastProcessedDate = new Date(userDate);

    // 1. Determine Opening Balance
    validRows.forEach(row => {
      const rDate = parseDate(row.POSTDATE);
      rDate.setHours(0, 0, 0, 0);

      if (rDate <= userDate) {
        let b = Number(row.Balance || 0);
        let b1 = Number(row['Balance_1']);
        if (!isNaN(b1) && ((b === 0 && b1 !== 0) || (b1 !== 0 && b !== b1))) b = b1;
        runningBalance = b;
        openingBal = b;
      }
    });

    // 2. Process Future Transactions and Fill Gaps
    const futureRows = validRows.filter(r => {
      const rd = parseDate(r.POSTDATE);
      rd.setHours(0, 0, 0, 0);
      return rd > userDate;
    });

    const finalTxRows = [];

    futureRows.forEach(row => {
      const rowDate = parseDate(row.POSTDATE);
      rowDate.setHours(0, 0, 0, 0);

      let nextExpectedDate = DdsEngine.getEndOfMonth(lastProcessedDate.getFullYear(), lastProcessedDate.getMonth() + 1);
      nextExpectedDate.setHours(0, 0, 0, 0);

      while (nextExpectedDate < rowDate && (nextExpectedDate.getMonth() !== rowDate.getMonth() || nextExpectedDate.getFullYear() !== rowDate.getFullYear())) {
        finalTxRows.push({
          POSTDATE: new Date(nextExpectedDate),
          Deposits: 0,
          Withdrawals: 0,
          CalculatedBalance: runningBalance,
          isAutoFilled: true
        });

        lastProcessedDate = nextExpectedDate;
        nextExpectedDate = DdsEngine.getEndOfMonth(lastProcessedDate.getFullYear(), lastProcessedDate.getMonth() + 1);
        nextExpectedDate.setHours(0, 0, 0, 0);
      }

      runningBalance = runningBalance + Number(row.Deposits || 0) - Number(row.Withdrawals || 0);
      row.CalculatedBalance = runningBalance;
      row.isAutoFilled = false;

      finalTxRows.push(row);
      lastProcessedDate = rowDate;
    });

    // 3. Carry Forward Balance Till Withdrawal Date Month
    let wdMonthKey = withdrawalDate.getFullYear() * 12 + withdrawalDate.getMonth();
    let lastMonthKey = lastProcessedDate.getFullYear() * 12 + lastProcessedDate.getMonth();

    while (lastMonthKey < wdMonthKey) {
      let nextExpectedDate = DdsEngine.getEndOfMonth(lastProcessedDate.getFullYear(), lastProcessedDate.getMonth() + 1);
      nextExpectedDate.setHours(0, 0, 0, 0);

      finalTxRows.push({
        POSTDATE: new Date(nextExpectedDate),
        Deposits: 0,
        Withdrawals: 0,
        CalculatedBalance: runningBalance,
        isAutoFilled: true
      });

      lastProcessedDate = nextExpectedDate;
      lastMonthKey = lastProcessedDate.getFullYear() * 12 + lastProcessedDate.getMonth();
    }

    return { openingBal, finalTxRows };
  };

  /**
   * Main Audit Calculation Generator
   * @param {Object} params
   * @param {Array<Object>} params.rows Prepared transaction rows
   * @param {number} params.dailyLimit Daily deposit limit (₹)
   * @param {Date|string} params.openDate Opening date
   * @param {Date|string} params.withdrawalDate Withdrawal date
   * @param {number} [params.openingBal=0] Opening balance
   * @param {number} [params.months] Duration months
   * @param {number} [params.days] Duration days
   * @param {Object} [params.config] Config overrides
   * @returns {Object}
   */
  DdsEngine.calculateReport = function (params) {
    try {
      const rows = params.rows || [];
      const limit = Number(params.dailyLimit);
      const openDateObj = parseDate(params.openDate);
      const withdrawalDateObj = parseDate(params.withdrawalDate);
      const startBal = Number(params.openingBal) || 0;
      const config = Object.assign({}, DdsEngine.DEFAULT_CONFIG, params.config || {});

      if (rows.length === 0) throw new Error("No transactions found to calculate.");
      if (isNaN(limit) || limit <= 0) throw new Error("Invalid Daily Limit Amount.");

      const dur = (params.months !== undefined && params.days !== undefined) 
        ? { ok: true, totalMonths: params.months, days: params.days } 
        : DdsEngine.calcDuration(openDateObj, withdrawalDateObj);

      const rate = DdsEngine.getRate(dur.totalMonths, dur.days, config);

      // Cutoff date for commission (trailing 6 months relative to withdrawal date)
      const nowForComm = new Date(withdrawalDateObj);
      const cutoffDate = new Date(nowForComm.getFullYear(), nowForComm.getMonth() - (config.commissionCutoffMonths - 1), 1);
      cutoffDate.setHours(0, 0, 0, 0);

      let totalComm = 0;
      let runningRecalBal = startBal;
      let currentMonthKey = '';
      let monthCumulDep = 0;
      let hasWithdrawalInMonth = false;

      const processed = rows.map((r) => {
        const d = parseDate(r.POSTDATE);
        const actualDim = (d.getMonth() === 1 && ((d.getFullYear() % 4 === 0 && d.getFullYear() % 100 !== 0) || d.getFullYear() % 400 === 0)) ? 29 : DAYS_IN_MONTH[d.getMonth() + 1];
        const interestDim = (config.interestDaysCapRule && actualDim === 30) ? 31 : actualDim;

        const mLimitCommission = limit * actualDim;
        const mLimitInterest = limit * interestDim;

        const dep = Number(r.Deposits || 0);
        const withDr = Number(r.Withdrawals || 0);

        const mKey = `${d.getMonth()}-${d.getFullYear()}`;
        if (mKey !== currentMonthKey) {
          currentMonthKey = mKey;
          monthCumulDep = 0;
          hasWithdrawalInMonth = false;
        }

        if (withDr > 0) hasWithdrawalInMonth = true;
        monthCumulDep += dep;

        // A. Commission calculation on actual days limit
        let excessForComm = 0;
        if (monthCumulDep > mLimitCommission) {
          const prevSum = monthCumulDep - dep;
          if (prevSum >= mLimitCommission) {
            excessForComm = dep;
          } else {
            excessForComm = monthCumulDep - mLimitCommission;
          }
        }

        const isRecent = d >= cutoffDate;
        let comm = 0;
        if (isRecent && excessForComm > 0) {
          comm = excessForComm * config.commissionRate;
        }
        totalComm += comm;

        // B. Interest limit calculation (31 days rule)
        let excessForBal = 0;
        if (monthCumulDep > mLimitInterest) {
          const prevSum = monthCumulDep - dep;
          if (prevSum >= mLimitInterest) {
            excessForBal = dep;
          } else {
            excessForBal = monthCumulDep - mLimitInterest;
          }
        }

        let addedAmount = 0;
        if (dep > 0) {
          if (hasWithdrawalInMonth) {
            addedAmount = dep;
          } else {
            addedAmount = dep - excessForBal;
          }
        }

        runningRecalBal = runningRecalBal + addedAmount - withDr;

        return {
          rawDate: d,
          date: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
          dateStr: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
          days: actualDim,
          dep: dep,
          withdraw: withDr,
          limit: mLimitCommission,
          bal: runningRecalBal,
          rawBal: r.CalculatedBalance,
          excess: excessForComm,
          comm: comm,
          isRecent: isRecent,
          isAutoFilled: r.isAutoFilled || false
        };
      });

      // Modified Balance Rules
      const lastEntryDate = processed[processed.length - 1].rawDate;
      const refDate = withdrawalDateObj;
      const isCurrentMonthIncluded = lastEntryDate.getMonth() === refDate.getMonth() && lastEntryDate.getFullYear() === refDate.getFullYear();

      const withdrawMonths = new Set();
      const modifiedBals = processed.map((r, i) => {
        const monthKey = `${r.rawDate.getMonth()}-${r.rawDate.getFullYear()}`;
        let adjustedBal = r.bal;

        if (r.withdraw > 0) {
          withdrawMonths.add(monthKey);
          return -r.withdraw;
        }

        if (withdrawMonths.has(monthKey) && r.dep > 0) {
          return r.dep;
        }

        if (isCurrentMonthIncluded) {
          if (i === processed.length - 1) return 0;
          if (processed.length > 1 && i === processed.length - 2) return adjustedBal * 0.5;
        } else {
          if (i === processed.length - 1) return adjustedBal * 0.5;
        }

        return adjustedBal;
      });

      // Check for Deposit in Opening Month
      const firstTxDate = processed.length > 0 ? processed[0].rawDate : null;
      const isSameMonthDeposit = firstTxDate &&
        firstTxDate.getMonth() === openDateObj.getMonth() &&
        firstTxDate.getFullYear() === openDateObj.getFullYear();

      const openingProduct = (isSameMonthDeposit) ? 0 : (startBal * rate) / 1200;
      const totalModBal = modifiedBals.reduce((a, b) => a + b, 0) + (isSameMonthDeposit ? 0 : startBal);

      const rowProducts = modifiedBals.map((bal) => (bal * rate) / 1200);
      const baseInterest = rowProducts.reduce((a, b) => a + b, 0) + openingProduct;
      const finalPayable = baseInterest - totalComm;

      const round = (v, d = 2) => BankingCore ? BankingCore.round(v, d) : Math.round(v * 100) / 100;

      return {
        ok: true,
        rate: rate,
        duration: dur,
        openDate: openDateObj,
        withdrawalDate: withdrawalDateObj,
        isCurrentMonthIncluded: isCurrentMonthIncluded,
        isSameMonthDeposit: isSameMonthDeposit,
        startBal: startBal,
        openingProduct: round(openingProduct, 2),
        totalModBal: round(totalModBal, 2),
        totalComm: round(totalComm, 2),
        baseInterest: round(baseInterest, 2),
        finalPayable: round(finalPayable, 2),
        processedRows: processed,
        modifiedBals: modifiedBals,
        rowProducts: rowProducts
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  return DdsEngine;
});
