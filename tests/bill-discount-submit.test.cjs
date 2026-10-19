const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture({ codes = [], dupSystem = 6001, readError = false } = {}) {
  const events = [], dialogs = [];
  const field = value => ({ value, scrollIntoView() {}, focus() {} });
  const file = { scrollIntoView() {}, focus() {}, files: [{ name: 'mapping.csv', type: 'text/csv' }] };
  const btnFields = {
    '.btn-sn': field('Discount'), '.btn-disc-val': field('10'), '.min-spend-check': { checked: false },
    '.min-val': field(''), '.upload-file': file, '.btn-disc-unit': field('CUR'),
    'input[name^="couponType"]:checked': field('Online'), 'input[name^="pMode"]:checked': field('All'),
  };
  const btn = { querySelector: s => btnFields[s] };
  const fields = { '.camp-name': field('Campaign'), '.camp-start': field('2026-10-01'),
    '.camp-end': field('2026-10-31'), '.camp-store': field('ALL'), '.camp-detail': field('Detail'), '.camp-condition': field('Terms') };
  const card = { querySelector: s => fields[s], querySelectorAll: s => s === '.pos-button-block' ? [btn] : [field('Take Away')] };
  const runner = { withSuccessHandler(fn) { this.success=fn; return this; }, withFailureHandler() { return this; },
    submitBillDiscountProposal(payload) { events.push('submit'); assert.equal(payload.campaigns.length, 1); this.success({status:'success'}); } };
  const context = { console, setTimeout() {}, document: {
    getElementById: id => field(id === 'globalMonth' ? '2026-10' : 'MKT'), querySelectorAll: () => [card],
  }, FileReader: class {
    readAsDataURL() { if (readError) this.onerror(); else this.onload({ target: { result: 'data:text/csv;base64,Y29kZQ==' } }); }
  }, Swal: { close() {}, fire(...args) { dialogs.push(args); return Promise.resolve({ isConfirmed: true }); } },
  PC_CodeConvert: {
    async inspectFromInput() { events.push('inspect-start'); await Promise.resolve(); events.push('inspect-end'); return { codes, dup: 0, invalid: 0, dupSystem }; },
    registerCodes(codes) { events.push('register'); return { codes }; },
    ingestFromInput() { throw new Error('must not start background ingestion'); },
  }, PC_SubmissionLog: { prepare() { return {}; }, afterSave(plan,opts) { events.push('saved'); context.successNote=opts.successNote; opts.onAfter(); } }, PC_CoPromo: { promptAfterSubmit() { events.push('copro'); } }, google: { script: { run: runner } } };
  context.window = context;
  vm.createContext(context);
  const html = fs.readFileSync('pages/BillDiscountProposal.html', 'utf8');
  const start = html.indexOf('  window.submitAllData = async function()');
  vm.runInContext(html.slice(start, html.indexOf('</script>', start)), context);
  return { context, events, dialogs };
}

test('submit proceeds without confirmation or duplicate details then continues from verified save to CoPromo', async () => {
  const f = fixture(); await f.context.submitAllData();
  assert.deepEqual(f.events, ['inspect-start', 'inspect-end', 'submit', 'saved', 'copro']);
  assert.equal(f.context.successNote, undefined);
  assert.equal(f.dialogs.some(d => d[0].showCancelButton || /ยืนยันส่งข้อมูล/.test(d[0].title || '')), false);
  assert.equal(f.dialogs.some(d=>d[0].title==='ยืนยันการบันทึก?'), false);
});
test('new mapping codes register after inspection before submitting', async () => {
  const f = fixture({ codes: ['NEW001'], dupSystem: 0 }); await f.context.submitAllData();
  assert.deepEqual(f.events, ['inspect-start', 'inspect-end', 'register', 'submit', 'saved', 'copro']);
});
test('file reading errors are shown without submitting or hanging', async () => {
  const f = fixture({ readError: true }); await f.context.submitAllData();
  assert.deepEqual(f.events, []);
  assert.match(f.dialogs[0][1], /อ่านไฟล์/);
});

test('inspection or registration failures show an error and do not submit', async () => {
  for (const stage of ['inspectFromInput', 'registerCodes']) {
    const f = fixture({ codes: ['NEW001'], dupSystem: 0 });
    f.context.PC_CodeConvert[stage] = () => { throw new Error('Mapping failed'); };
    await f.context.submitAllData();
    assert.equal(f.events.includes('submit'), false);
    assert.match(f.dialogs.at(-1)[1], /Mapping failed/);
  }
});
