const test = require('node:test');
const assert = require('node:assert/strict');
const Dds = require('../assets/js/calculators/dds-engine.js');
const Lakhpati = require('../assets/js/calculators/lakhpati-engine.js');
const Dividend = require('../assets/js/calculators/dividend-engine.js');

test('DDS: text dates are kept and sorted by real date', () => {
  const rows = [
    { POSTDATE: '13/02/2025', Deposits: 28000, Withdrawals: 0 },
    { POSTDATE: '05/01/2025', Deposits: 30000, Withdrawals: 0 },
    { POSTDATE: '20/03/2025', Deposits: 31000, Withdrawals: 0 }
  ];
  const { finalTxRows } = Dds.prepareTransactions(rows, new Date(2024, 11, 31), new Date(2025, 3, 30, 23, 59));
  const real = finalTxRows.filter(r => !r.isAutoFilled);
  assert.deepEqual(real.map(r => r.Deposits), [30000, 28000, 31000]);
  assert.equal(real[2].CalculatedBalance, 89000);
  assert.equal(finalTxRows.length, 4); // + carried-forward April
});

test('DDS: duration and rate bands', () => {
  const d = Dds.calcDuration('01/01/2025', new Date(2026, 0, 2));
  assert.equal(d.totalMonths, 12);
  assert.equal(d.days, 1);
  assert.equal(Dds.getRate(d.totalMonths, d.days), 5.0);
  assert.equal(Dds.getRate(12, 0), 2.0);
});

test('DDS: calcDuration does not modify the caller\'s dates', () => {
  const end = new Date(2026, 0, 2, 15, 30);
  Dds.calcDuration('01/01/2025', end);
  assert.equal(end.getHours(), 15);
});

test('Lakhpati: blank received amount means every month is due', () => {
  const r = Lakhpati.calculate({
    openDate: '2025-01-10', monthlyAmount: 1000, rate: 2, receivedAmount: '', refDate: new Date(2025, 4, 10)
  });
  assert.equal(r.ok, true);
  assert.equal(r.skippedCount, 4);
  assert.equal(r.totalPenalty, (1000 + 2000 + 3000 + 4000) * 0.02);
});

test('Lakhpati: up-to-date account has no penalty', () => {
  const r = Lakhpati.calculate({
    openDate: '2025-01-10', monthlyAmount: 1000, rate: 2, receivedAmount: 4000, refDate: new Date(2025, 4, 10)
  });
  assert.equal(r.skippedCount, 0);
  assert.equal(r.grandTotal, 0);
});

test('Dividend: allotment month is excluded', () => {
  const r = Dividend.calculate({ type: 'new', rate: 12, amount: 10000, actionDate: '15/06/2025' });
  assert.equal(r.monthsCount, 9); // Jul–Mar
  assert.equal(r.totalDividend, 900);
});

test('Dividend: resignation pays months before the resignation month', () => {
  const r = Dividend.calculate({ type: 'resigned', rate: 12, amount: 10000, actionDate: '15/06/2025' });
  assert.equal(r.monthsCount, 2); // Apr–May
  assert.equal(r.totalDividend, 200);
});
