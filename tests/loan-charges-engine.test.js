const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../assets/js/calculators/loan-charges-engine.js');

// Shaped like a vehicle loan scheme in Supabase (field 0 is cell B2)
const VEHICLE = [
  { label: 'LOAN HISTORY', type: 'select', formula: '1st:0,2nd:1' },               // B2
  { label: 'LOAN AMOUNT', type: 'input', formula: null },                          // B3
  { label: 'LOAN FORM', type: 'output', formula: '200' },                          // B4
  { label: 'GST 18% ON LOAN FORM', type: 'output', formula: 'B4*18/100' },         // B5
  { label: 'LPC', type: 'output', formula: 'IF(B2=0,B3*1.5/100,IF(B2=1,B3*1/100))' }, // B6
  { label: 'LOAN AGREEMENT', type: 'output', formula: 'IF(B3<=500000, B3*0.10/100, ROUND(B3*0.20/100, -2))' }, // B7
  { label: 'ADHESIVE', type: 'input', formula: '500' },                            // B8
  { label: 'TOTAL', type: 'output', formula: 'SUM(B4:B8)' }                        // B9
];

test('evaluates a scheme like the Google Sheet', () => {
  const s = Engine.compile(VEHICLE);
  assert.deepEqual(s.errors, {});
  const r = s.evaluate({ 0: 0, 1: 600000, 6: 500 });
  assert.equal(r.values[3], 36);       // GST on 200
  assert.equal(r.values[4], 9000);     // 1.5% LPC
  assert.equal(r.values[5], 1200);     // ROUND(1200, -2)
  assert.equal(r.total, 200 + 36 + 9000 + 1200 + 500);
});

test('ROUND follows Excel (1.005 -> 1.01, halves away from zero, negative digits)', () => {
  const s = Engine.compile([
    { label: 'A', type: 'output', formula: 'ROUND(1.005, 2)' },
    { label: 'B', type: 'output', formula: 'ROUND(-2.5, 0)' },
    { label: 'C', type: 'output', formula: 'ROUND(1250, -2)' },
    { label: 'D', type: 'output', formula: 'ROUND(1249, -2)' }
  ]);
  assert.deepEqual(s.evaluate({}).values, [1.01, -3, 1300, 1200]);
});

test('IF without a false branch counts as 0', () => {
  const s = Engine.compile([
    { label: 'H', type: 'input' },
    { label: 'X', type: 'output', formula: 'IF(B2=1, 100)' }
  ]);
  assert.equal(s.evaluate({ 0: 0 }).values[1], 0);
  assert.equal(s.evaluate({ 0: 1 }).values[1], 100);
});

test('percent, AND, MIN and lowercase references', () => {
  const s = Engine.compile([
    { label: 'TYPE', type: 'input' },
    { label: 'AMT', type: 'input' },
    { label: 'REG', type: 'output', formula: '=IF(b2=0, MIN(b3*0.5%, 15000), 0)' },
    { label: 'STAMP', type: 'output', formula: 'IF(AND(B2=1, B3<=500000), B3*0.1%, B3*0.3%)' }
  ]);
  assert.deepEqual(s.evaluate({ 0: 0, 1: 4000000 }).values.slice(2), [15000, 12000]);
  assert.deepEqual(s.evaluate({ 0: 1, 1: 400000 }).values.slice(2), [0, 400]);
});

test('outputs are evaluated in dependency order, not row order', () => {
  // TOTAL is first but depends on fields below it; a fixed number of passes would miss deep chains
  const s = Engine.compile([
    { label: 'TOTAL', type: 'output', formula: 'SUM(B3:B6)' },
    { label: 'A', type: 'output', formula: 'B4+1' },
    { label: 'B', type: 'output', formula: 'B5+1' },
    { label: 'C', type: 'output', formula: 'B6+1' },
    { label: 'D', type: 'output', formula: '10' }
  ]);
  assert.equal(s.evaluate({}).total, 13 + 12 + 11 + 10);
});

test('SUM with a range plus extra arguments', () => {
  const s = Engine.compile([
    { label: 'A', type: 'input' }, { label: 'B', type: 'input' }, { label: 'C', type: 'input' },
    { label: 'TOTAL', type: 'output', formula: 'SUM(B2:B3, B4)' }
  ]);
  assert.equal(s.evaluate({ 0: 1, 1: 2, 2: 3 }).total, 6);
});

test('type is case-insensitive (an "Output" row is still calculated)', () => {
  const s = Engine.compile([
    { label: 'AMT', type: 'Input' },
    { label: 'FEE', type: 'Output', formula: 'B2*2' }
  ]);
  assert.equal(s.evaluate({ 0: 5 }).values[1], 10);
});

test('circular references and bad formulas are reported, not thrown', () => {
  const s = Engine.compile([
    { label: 'A', type: 'output', formula: 'B3+1' },
    { label: 'B', type: 'output', formula: 'B2+1' },
    { label: 'C', type: 'output', formula: 'B99*2' },
    { label: 'D', type: 'output', formula: 'SUM(B2' }
  ]);
  assert.match(s.errors[0] + s.errors[1], /Circular/);
  assert.match(s.errors[2], /Unknown reference B99/);
  assert.match(s.errors[3], /Missing "\)"/);
  assert.doesNotThrow(() => s.evaluate({}));
});

test('formulas cannot run arbitrary code', () => {
  const s = Engine.compile([
    { label: 'A', type: 'output', formula: 'constructor.constructor("return 1")()' },
    { label: 'B', type: 'output', formula: 'alert(1)' },
    { label: 'C', type: 'output', formula: 'B2;process.exit()' },
    { label: 'D', type: 'output', formula: '"text"' }
  ]);
  assert.equal(Object.keys(s.errors).length, 4);
});

test('select options and input defaults', () => {
  assert.deepEqual(
    Engine.parseOptions({ formula: 'City 2900:2900, Rural 1900:1900' }),
    [{ label: 'City 2900', value: 2900 }, { label: 'Rural 1900', value: 1900 }]
  );
  assert.equal(Engine.initialValue(Engine.normalizeField({ type: 'input', formula: '500' })), 500);
  assert.equal(Engine.initialValue(Engine.normalizeField({ type: 'input', default_value: 1200 })), 1200);
  assert.equal(Engine.initialValue(Engine.normalizeField({ type: 'input', formula: null })), null);
});

test('null label from the database does not crash', () => {
  const f = Engine.normalizeField({ label: null, type: 'input' });
  assert.equal(f.label, '');
  assert.equal(Engine.isTotal(f), false);
});

// v2 layout (loan_scheme_fields): named keys, options array, in_total flags, no TOTAL row
const TOP_UP_V2 = [
  { key: 'amount', label: 'LOAN AMOUNT', kind: 'input', in_total: false },
  { key: 'loan_form', label: 'LOAN FORM', kind: 'output', formula: '250', in_total: true },
  { key: 'gst_loan_form', label: 'GST 18% ON LOAN FORM', kind: 'output', formula: 'loan_form*18/100', in_total: true },
  { key: 'lpc', label: 'LPC 1%', kind: 'output', formula: 'amount*1%', in_total: true },
  { key: 'gst_lpc', label: 'GST 18% ON LPC', kind: 'output', formula: 'gst_lpc_base*18/100', in_total: true },
  { key: 'gst_lpc_base', label: 'LPC FOR GST', kind: 'output', formula: 'lpc', in_total: false },
  { key: 'notary', label: 'NOTARY CHARGES', kind: 'input', default_value: 300, in_total: true }
];

test('v2: named keys, in_total flags and defaults', () => {
  const s = Engine.compile(TOP_UP_V2);
  assert.deepEqual(s.errors, {});
  assert.equal(Engine.initialValue(s.fields[6]), 300);
  const r = s.evaluate({ 0: 1000000, 6: 300 });
  // loan amount is not part of the deductions
  assert.equal(r.total, 250 + 45 + 10000 + 1800 + 300);
  assert.equal(s.fields.some(Engine.isTotal), false);
});

test('v2: cell positions are not valid references', () => {
  const s = Engine.compile([
    { key: 'amount', label: 'AMOUNT', kind: 'input' },
    { key: 'fee', label: 'FEE', kind: 'output', formula: 'B2*2' }
  ]);
  assert.match(s.errors[1], /Unknown reference B2/);
});

test('v2: select options come from the options array', () => {
  const f = Engine.normalizeField({ key: 'mortgage_type', label: 'MORTGAGE TYPE', kind: 'select',
    options: [{ label: 'REGISTER', value: 0 }, { label: 'EQUITABLE', value: 1 }] });
  assert.deepEqual(Engine.parseOptions(f).map(o => o.value), [0, 1]);
  const s = Engine.compile([
    f,
    { key: 'amount', label: 'AMOUNT', kind: 'input' },
    { key: 'stamp_duty', label: 'STAMP DUTY', kind: 'output', in_total: true,
      formula: 'IF(AND(mortgage_type=1, amount<=500000), amount*0.1/100, amount*0.3/100)' }
  ]);
  assert.equal(s.evaluate({ 0: 1, 1: 400000 }).total, 400);
  assert.equal(s.evaluate({ 0: 0, 1: 400000 }).total, 1200);
});
