/**
 * ============================================================================
 * SAVING ACCOUNT INTEREST ENGINE
 * Monthly minimum balance audit and creditable interest schedule calculations
 * from bank ledger statements.
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
    root.BankingSavingEngine = engine;
    if (root.BankingCore) {
      root.BankingCore.calculators = root.BankingCore.calculators || {};
      root.BankingCore.calculators.saving = engine;
    }
  }
})(typeof self !== 'undefined' ? self : this, function (BankingCore) {
  'use strict';

  const SavingEngine = {
    version: '1.0.0',
    DEFAULT_CONFIG: {
      defaultRate: 3.5 // 3.5% p.a.
    }
  };

  function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (BankingCore && BankingCore.dates && BankingCore.dates.parse) {
      return BankingCore.dates.parse(val);
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  function cleanAmount(val) {
    return BankingCore ? BankingCore.parseAmount(val) : (parseFloat(val) || 0);
  }

  /**
   * Parse rows from excel/csv statement into structured transactions
   * @param {Array<Array<any>>} rows
   * @returns {Object} { ok, periodStart, periodEnd, openingBal, transactions, error }
   */
  SavingEngine.parseStatementRows = function (rows) {
    try {
      if (!rows || !rows.length) throw new Error("Empty statement data.");

      let periodStart, periodEnd, openingBal = null, headerIdx = -1;
      let col = { date: -1, dr: -1, cr: -1, bal: -1 };

      for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const rowStr = rows[i].join(' ');
        const dMatch = rowStr.match(/From Date\s+([\d/-]+)\s+To\s+([\d/-]+)/i);
        if (dMatch) {
          periodStart = parseDate(dMatch[1]);
          periodEnd = parseDate(dMatch[2]);
        }
        const bMatch = rowStr.match(/Opening Balance\s*[:\s-]\s*([\d,]+\.\d{2})/i);
        if (bMatch) openingBal = cleanAmount(bMatch[1]);

        const lowerRow = rows[i].map(c => String(c).toLowerCase().trim());
        if (lowerRow.some(c => c.includes('entry date'))) {
          headerIdx = i;
          lowerRow.forEach((c, k) => {
            if (c.includes('entry date')) col.date = k;
            else if (c.includes('dr amount') || c === 'debit') col.dr = k;
            else if (c.includes('cr amount') || c === 'credit') col.cr = k;
            else if (c.includes('total amount') || c.includes('balance')) col.bal = k;
          });
          break;
        }
      }

      if (headerIdx === -1 || col.date === -1 || col.bal === -1) {
        throw new Error("Statement column headers not recognized. Required: Entry Date and Balance.");
      }

      const transactions = [];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const d = parseDate(row[col.date]);
        if (d && !isNaN(d.getTime())) {
          transactions.push({
            date: d,
            dr: col.dr !== -1 ? cleanAmount(row[col.dr]) : 0,
            cr: col.cr !== -1 ? cleanAmount(row[col.cr]) : 0,
            bal: cleanAmount(row[col.bal])
          });
        }
      }

      if (transactions.length === 0) throw new Error("No transactions found in statement.");
      transactions.sort((a, b) => a.date - b.date);

      if (!periodStart) periodStart = new Date(transactions[0].date.getFullYear(), transactions[0].date.getMonth(), 1);
      if (!periodEnd) periodEnd = new Date(transactions[transactions.length - 1].date.getFullYear(), transactions[transactions.length - 1].date.getMonth() + 1, 0);
      if (openingBal === null) openingBal = transactions[0].bal + transactions[0].dr - transactions[0].cr;

      return {
        ok: true,
        periodStart: periodStart,
        periodEnd: periodEnd,
        openingBal: openingBal,
        transactions: transactions
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  /**
   * Calculate Monthly Minimum Balance Schedule & Interest
   * @param {Object} params
   * @param {Array<Object>} params.transactions
   * @param {number} params.openingBal
   * @param {Date|string} params.periodStart
   * @param {Date|string} params.periodEnd
   * @param {number} params.rate Annual interest rate %
   * @returns {Object}
   */
  SavingEngine.calculateSchedule = function (params) {
    try {
      const transactions = params.transactions || [];
      const openingBal = Number(params.openingBal) || 0;
      const periodStart = parseDate(params.periodStart);
      const periodEnd = parseDate(params.periodEnd);
      const rate = typeof params.rate === 'number' ? params.rate : parseFloat(params.rate) || 0;

      if (!periodStart || !periodEnd) throw new Error("Invalid statement period dates.");

      let currDate = new Date(periodStart);
      const endDate = new Date(periodEnd);
      let currBal = openingBal;
      const txMap = {};

      transactions.forEach(tx => {
        const d = parseDate(tx.date);
        const k = d.toDateString();
        if (!txMap[k]) txMap[k] = [];
        txMap[k].push(tx);
      });

      const monthlyMin = {};
      while (currDate <= endDate) {
        const k = currDate.toDateString();
        if (txMap[k]) {
          const txs = txMap[k];
          currBal = txs[txs.length - 1].bal;
        }

        const mKey = `${currDate.getFullYear()}-${currDate.getMonth()}`;
        if (!monthlyMin[mKey]) {
          monthlyMin[mKey] = {
            year: currDate.getFullYear(),
            month: currDate.getMonth(),
            min: currBal,
            name: currDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
            sort: currDate.getFullYear() * 12 + currDate.getMonth()
          };
        } else {
          if (currBal < monthlyMin[mKey].min) monthlyMin[mKey].min = currBal;
        }
        currDate.setDate(currDate.getDate() + 1);
      }

      let totalInt = 0;
      let totalBal = 0;

      const round = (v, d = 2) => BankingCore ? BankingCore.round(v, d) : Math.round(v * 100) / 100;

      const scheduleItems = Object.values(monthlyMin).sort((a, b) => a.sort - b.sort).map(item => {
        const interest = (item.min * (rate / 100)) / 12;
        totalInt += interest;
        totalBal += item.min;

        return {
          name: item.name,
          minBalance: round(item.min, 2),
          interest: round(interest, 2),
          rate: rate,
          formula: `(${item.min.toFixed(2)} × ${rate}%) ÷ 12`
        };
      });

      return {
        ok: true,
        rate: rate,
        periodStart: periodStart,
        periodEnd: periodEnd,
        openingBal: round(openingBal, 2),
        totalInterest: round(totalInt, 2),
        totalMinBal: round(totalBal, 2),
        items: scheduleItems
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  return SavingEngine;
});
