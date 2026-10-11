const test = require('node:test');
const assert = require('node:assert/strict');
const BankingCore = require('../assets/js/banking-core.js');

// BankingCore.round is the original rounding and must stay unchanged: DDS results depend on it.
test('round: original behaviour (kept for DDS)', () => {
  assert.equal(BankingCore.round(2.5, 0), 3);
  assert.equal(BankingCore.round(-2.5, 0), -3);
  assert.equal(BankingCore.round(0.1 + 0.2, 2), 0.3);
  assert.equal(BankingCore.round(1.005, 2), 1.01);
  assert.equal(BankingCore.round('abc'), 0);
  assert.equal(BankingCore.round(Infinity), 0);
});

test('formatINR uses lakh / crore grouping', () => {
  assert.equal(BankingCore.formatINR(1234567.89), '₹ 12,34,567.89');
  assert.equal(BankingCore.formatINR(-1500, { showSymbol: false, decimals: 0 }), '-1,500');
  assert.equal(BankingCore.formatINR('₹ 1,00,000'), '₹ 1,00,000.00');
});

test('numberToWords', () => {
  assert.equal(BankingCore.numberToWords(1532450.5), 'Rupees Fifteen Lakh Thirty Two Thousand Four Hundred and Fifty and Fifty Paise Only');
  assert.equal(BankingCore.numberToWords(0), 'Rupees Zero Only');
  assert.equal(BankingCore.numberToWords(10000000), 'Rupees One Crore Only');
});

test('dates.parse accepts bank formats and rejects rollover', () => {
  const d = BankingCore.dates.parse('13/05/2026');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 4, 13]);
  assert.equal(BankingCore.dates.parse('2026-05-13').getDate(), 13);
  assert.equal(BankingCore.dates.parse('31/02/2026'), null);
  assert.equal(BankingCore.dates.parse('5'), null);
});

test('dates.todayISO uses the local calendar date', () => {
  // 00:30 local time must not roll back to the previous day (toISOString would in IST)
  assert.equal(BankingCore.dates.todayISO(new Date(2026, 3, 1, 0, 30)), '2026-04-01');
});

test('dates.getFinancialYear', () => {
  assert.equal(BankingCore.dates.getFinancialYear(new Date(2026, 2, 31)), '2025-2026');
  assert.equal(BankingCore.dates.getFinancialYear(new Date(2026, 3, 1)), '2026-2027');
});

test('dates.diffYMD: completed years, months and days', () => {
  assert.deepEqual(BankingCore.dates.diffYMD('15/01/2025', '14/03/2026'), { years: 1, months: 1, days: 27, totalMonths: 13 });
  assert.equal(BankingCore.dates.diffYMD('2026-01-02', '2026-01-01'), null);
});

test('dates.parse returns a copy of a Date', () => {
  const d = new Date(2026, 0, 2, 15, 30);
  const p = BankingCore.dates.parse(d);
  p.setHours(0, 0, 0, 0);
  assert.equal(d.getHours(), 15);
});

// Pending decision: for start days 29-31 the current method can return negative days
// (31-Jan -> 1-Mar = 1 month, -1 days). Excel EDATE semantics would give 1 month 1 day.
test('dates.diffYMD: month-end start dates (EDATE semantics)', { todo: 'awaiting decision on month-end rule' }, () => {
  assert.deepEqual(BankingCore.dates.diffYMD('2024-01-31', '2024-03-01'), { years: 0, months: 1, days: 1, totalMonths: 1 });
});
