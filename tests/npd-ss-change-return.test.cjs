const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/* IT เปลี่ยน SS Code ของ Subset ใหม่ในงาน NPD: SS0167 → SS0170
   เลขเดิมต้องคืนคลัง ออกจากทะเบียน Subset · สูตรผงย้ายตาม · No flavor = 99999 เสมอ */
function setup(extraNpd) {
  const id = 'NPD-SS1';
  const powders = [
    { cmpos: '1031001', eng: 'Cheese', th: 'Cheese', code: '3097', desc: 'Cheese', qty: '2', unit: 'g', seq: 1 },
    { cmpos: '1031002', eng: 'No flavor', th: 'No flavor', seq: 99, noFlavor: true }
  ];
  const npd = { id, project: 'New Item - SS', start: '2026-11-01', end: '2026-11-30', store: 'ALL', status: 'PENDING', itStatus: 'COMPLETE',
    subsets: [{ ssCode: 'SS0167', name: 'Test Sub', name2: 'TS', powders }],
    items: [{ name: 'Item A', th: 'ไอเทม', code: '101501', cateCode: '101', category: 'Fries', saleModes: ['Take-Away'], priceTakeaway: '59',
      recipes: [{ code: '3060', desc: 'RM', qty: '1', unit: 'G', channels: ['Take-Away'] }], formulas: [{ ss: 'SS0167', choose: 1 }] }] };
  const ss = (code, n) => ({ code, type: 'ss', num: n, status: 'CONFIRMED', where: 'NPD (RD เพิ่ม Subset)' });
  const data = new Map([
    ['pc_code_counter_v1', JSON.stringify({ v: 1, migItemset: 2, types: { ss: { cursor: 170 } }, cats: {}, reservations: { 'ss::SS0167': ss('SS0167', 167), 'ss::SS0170': ss('SS0170', 170) }, log: [] })],
    ['pc_mock_store_v28', JSON.stringify({ months: {}, npd: [npd].concat(extraNpd || []), npdProducts: [], recipeCustom: {}, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1 })]
  ]);
  const ctx = { URL, Date, Math, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    console: { log() {}, warn() {}, error() {} }, location: { hostname: 'localhost' },
    PC_REAL_PROMOS: [], document: { addEventListener() {}, querySelectorAll() { return []; } },
    localStorage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), key: i => [...data.keys()][i], get length() { return data.size; } }
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const file of ['js/mock-backend.js', 'js/code-counter.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return { ctx, npd, data };
}
const rows = data => JSON.parse(data.get('pc_mock_store_v28')).npdProducts;
const changed = npd => { const e = JSON.parse(JSON.stringify(npd)); e.subsets[0].ssCode = 'SS0170'; e.items[0].formulas[0].ss = 'SS0170'; return e; };

test('changing a new SUBSET\'s SS Code on the IT page returns the old code and drops it from the subset registry', () => {
  const { ctx, npd, data } = setup();
  ctx.PC_API.updateNpd(npd.id, JSON.parse(JSON.stringify(npd)));   // first save registers SS0167
  assert.ok(ctx.PC_SUBSET_MASTER.some(x => x.ssCode === 'SS0167'));
  const r = ctx.PC_API.updateNpd(npd.id, changed(npd));
  assert.equal(r.status, 'success', r.message);
  assert.deepEqual([...r.returnedSs], ['SS0167']);
  assert.equal(ctx.PC_COUNTER.entryOf('SS0167', 'ss'), null);
  assert.ok(!ctx.PC_SUBSET_MASTER.some(x => x.ssCode === 'SS0167'));
  assert.ok(ctx.PC_SUBSET_MASTER.some(x => x.ssCode === 'SS0170'));
  assert.ok(!JSON.parse(data.get('pc_subset_custom')).some(x => x.ssCode === 'SS0167'));
  const flv = rows(data).filter(p => p.ssCode);
  assert.ok(flv.length && flv.every(p => p.ssCode === 'SS0170'));
  assert.deepEqual(JSON.parse(data.get('pc_itemset_comp'))['101501'].map(r => r.code), ['SS0170']);
});

test('an old SS Code still used by another job is kept', () => {
  const other = { id: 'NPD-OTHER', project: 'Other', subsets: [], items: [{ name: 'B', code: '101777', formulas: [{ ss: 'SS0167', choose: 1 }] }] };
  const { ctx, npd } = setup([other]);
  const r = ctx.PC_API.updateNpd(npd.id, changed(npd));
  assert.deepEqual([...r.returnedSs], []);
  assert.ok(ctx.PC_COUNTER.entryOf('SS0167', 'ss'));
});

test('No flavor is always POS order 99999', () => {
  const { ctx, npd, data } = setup();
  const r = ctx.PC_API.updateNpd(npd.id, JSON.parse(JSON.stringify(npd)));
  assert.equal(r.status, 'success', r.message);
  assert.equal(rows(data).find(p => p.itemCode === '1031002').posSeq, 99999);
  assert.equal(rows(data).find(p => p.itemCode === '1031001').posSeq, 1);
  assert.equal(JSON.parse(data.get('pc_mock_store_v28')).npd[0].subsets[0].powders[1].seq, 99999);
});

/* เคสจริง NPD-2026008: IT สลับ SS0176→SS0177 และ SS0177→SS0178 ในใบเดียวกัน ก่อนมีระบบย้ายสูตรตาม
   สูตรผงยังอ้างเลขเดิม → บันทึกซ้ำแล้วระบบต้องย้ายตามชื่อ Subset ที่เลขนั้นเคยลงทะเบียนไว้ และบันทึกอีกรอบต้องไม่เปลี่ยนอีก */
test('a chained SS swap saved earlier is repaired on the next IT save, and only once', () => {
  const { ctx, npd, data } = setup();
  npd.subsets = [
    { ssCode: 'SS0176', name: 'Enoki 1', name2: 'ENF 1', powders: [{ cmpos: '1031001', eng: 'Cheese ENF 1', code: '3097', desc: 'C', qty: '2', unit: 'g', seq: 1 }] },
    { ssCode: 'SS0177', name: 'Enoki 2', name2: 'ENF 2', powders: [{ cmpos: '1031002', eng: 'Cheese ENF 2', code: '3097', desc: 'C', qty: '2', unit: 'g', seq: 1 }] }
  ];
  npd.items[0].formulas = [{ ss: 'SS0176', choose: 1 }];
  npd.items.push(Object.assign(JSON.parse(JSON.stringify(npd.items[0])), { code: '101502', formulas: [{ ss: 'SS0177', choose: 1 }] }));
  assert.equal(ctx.PC_API.updateNpd(npd.id, JSON.parse(JSON.stringify(npd))).status, 'success');
  // old IT page: codes swapped but formulas left behind
  const swapped = JSON.parse(JSON.stringify(npd)); swapped.subsets[0].ssCode = 'SS0177'; swapped.subsets[1].ssCode = 'SS0178';
  ctx.PC_API.updateNpd(npd.id, swapped);
  const saved = JSON.parse(data.get('pc_mock_store_v28')).npd[0];
  const r = ctx.PC_API.updateNpd(npd.id, JSON.parse(JSON.stringify(saved)));
  assert.equal(r.status, 'success', r.message);
  const job = JSON.parse(data.get('pc_mock_store_v28')).npd[0];
  assert.deepEqual(job.items.map(it => it.formulas[0].ss), ['SS0177', 'SS0178']);
  assert.deepEqual(['101501', '101502'].map(c => JSON.parse(data.get('pc_itemset_comp'))[c][0].code), ['SS0177', 'SS0178']);
  assert.equal(ctx.PC_SUBSET_MASTER.find(x => x.ssCode === 'SS0177').name, 'Enoki 1');
  assert.ok(!ctx.PC_SUBSET_MASTER.some(x => x.ssCode === 'SS0176'));
  assert.equal(ctx.PC_COUNTER.entryOf('SS0177', 'ss').status, 'CONFIRMED');
  const again = ctx.PC_API.updateNpd(npd.id, JSON.parse(JSON.stringify(job)));
  assert.deepEqual([...again.ssFixed], []);
  assert.deepEqual(JSON.parse(data.get('pc_mock_store_v28')).npd[0].items.map(it => it.formulas[0].ss), ['SS0177', 'SS0178']);
});
