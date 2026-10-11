const test = require('node:test');
const assert = require('node:assert/strict');
const Emi = require('../assets/js/calculators/emi-engine.js');
const ArbOverdue = require('../assets/js/calculators/arb-overdue-engine.js');
const Dds = require('../assets/js/calculators/dds-engine.js');

test('EMI: standard reducing-balance instalment', () => {
  const r = Emi.calculate({ principal: 500000, annualRate: 9.5, months: 60 });
  assert.equal(r.ok, true);
  assert.equal(r.emi, 10501);
  assert.equal(r.schedule.length, 60);
  assert.equal(r.schedule[59].balance, 0);
  assert.equal(r.totalPrincipal, 500000);
  assert.equal(r.totalPayment, r.totalPrincipal + r.totalInterest);
});

test('EMI: summary totals equal the sum of the schedule', () => {
  const r = Emi.calculate({ principal: 123456, annualRate: 11, months: 37 });
  const sum = r.schedule.reduce((s, x) => s + x.total, 0);
  assert.equal(r.totalPayment, sum);
});

test('EMI: zero interest and invalid input', () => {
  const r = Emi.calculate({ principal: 12000, annualRate: 0, months: 12 });
  assert.equal(r.emi, 1000);
  assert.equal(r.totalInterest, 0);
  assert.equal(Emi.calculate({ principal: 0, annualRate: 9, months: 12 }).ok, false);
  assert.equal(Emi.calculate({ principal: 1000, annualRate: 9, months: 0 }).ok, false);
});

test('ARB savlat audit', () => {
  const ok = ArbOverdue.auditSavlat({ balancePrastav: 500000, sanctionAmount: 400000, amountReceived: 420000, closingBalance: 510000 });
  assert.equal(ok.prastavDiscount, 100000);
  assert.equal(ok.closingDiscount, 90000);
  assert.equal(ok.withinLimit, true);
  const bad = ArbOverdue.auditSavlat({ balancePrastav: 500000, sanctionAmount: 400000, amountReceived: 380000, closingBalance: 500000 });
  assert.equal(bad.withinLimit, false);
});

test('ARB overdue interest on a 365-day basis', () => {
  const r = ArbOverdue.overdueInterest({ principal: 100000, rate: 12, fromDate: '01/04/2025', toDate: new Date(2026, 3, 1) });
  assert.equal(r.days, 365);
  assert.equal(r.interest, 12000);
  assert.equal(ArbOverdue.overdueInterest({ principal: 100000, rate: 12, fromDate: '02/04/2026', toDate: new Date(2026, 3, 1) }).ok, false);
});

test('DDS policy: minimum duration and rate band', () => {
  assert.equal(Dds.validatePolicy(Dds.calcDuration('01/01/2024', new Date(2024, 6, 1))).valid, false); // 6 m 0 d
  assert.equal(Dds.validatePolicy(Dds.calcDuration('01/01/2024', new Date(2024, 6, 2))).valid, true);  // 6 m 1 d
  assert.equal(Dds.getRate(12, 0), 2.0);
  assert.equal(Dds.getRate(12, 1), 5.0);
});
