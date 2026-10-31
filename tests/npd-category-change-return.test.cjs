const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/* งาน NPD ที่ IT บันทึก (COMPLETE) ไปแล้ว แล้วมาเปลี่ยนหมวดทีหลัง: 121021-121022 → 101xxx
   เลขเดิมต้องออกจาก Product Master และคืนเข้าคลังเลข */
function setup() {
  const id = 'NPD-T1', project = 'New Item - Test';
  const item = (code, cc, cat) => ({ name: 'Item ' + code, th: 'ไอเทม', code, cateCode: cc, category: cat, saleModes: ['Take-Away'], priceTakeaway: '59', recipes: [{ code: '3060', desc: 'RM', qty: '1', unit: 'G', channels: ['Take-Away'] }], formulas: [] });
  const npd = { id, project, start: '2026-11-01', end: '2026-11-30', store: 'ALL', status: 'PENDING', itStatus: 'COMPLETE', subsets: [], items: [item('121021', '121', 'Old Cate'), item('121022', '121', 'Old Cate')] };
  const row = code => ({ itemCode: code, itemNameEN: 'Item ' + code, cateCode: '121', _fromNpd: id });
  const other = { itemCode: '121099', itemNameEN: 'Other job', cateCode: '121', _fromNpd: 'NPD-OTHER' };
  const res = code => ({ code, type: 'item', num: Number(code.slice(3)), cat: '121', status: 'CONFIRMED', where: id + ' (' + project + ')' });
  const data = new Map([
    ['pc_code_counter_v1', JSON.stringify({ v: 1, migItemset: 2, types: {}, cats: { '121': { cursor: 22, seeded: true } }, reservations: { 'item::121021': res('121021'), 'item::121022': res('121022') }, log: [] })],
    ['pc_mock_store_v28', JSON.stringify({ months: {}, npd: [npd], npdProducts: [row('121021'), row('121022'), other], recipeCustom: { '121021': { _fromNpd: id, modes: {} } }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1 })]
  ]);
  const ctx = { URL, Date, Math, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    console: { log() {}, warn() {}, error() {} }, location: { hostname: 'localhost' },
    PC_REAL_PROMOS: [], document: { addEventListener() {}, querySelectorAll() { return []; } },
    localStorage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), key: i => [...data.keys()][i], get length() { return data.size; } }
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const file of ['js/mock-backend.js', 'js/code-counter.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return { ctx, data, npd, item };
}

test('re-saving a COMPLETE NPD after a category change drops the old item rows and returns the old codes', () => {
  const { ctx, npd, item } = setup();
  const edit = JSON.parse(JSON.stringify(npd));
  edit.items = [item('101501', '101', 'Fries'), item('101502', '101', 'Fries')];
  const r = ctx.PC_API.updateNpd(npd.id, edit);
  assert.equal(r.status, 'success', r.message);
  assert.deepEqual([...r.returned].sort(), ['121021', '121022']);
  const codes = ctx.PC_API.getNpdProducts().map(p => p.itemCode);
  assert.ok(!codes.includes('121021') && !codes.includes('121022'));
  assert.ok(codes.includes('101501') && codes.includes('101502'));
  assert.ok(codes.includes('121099'), 'another job\'s row is untouched');
  assert.equal(ctx.PC_COUNTER.entryOf('121021', 'item'), null);
  assert.equal(ctx.PC_COUNTER.entryOf('121022', 'item'), null);
});

test('re-saving without a category change returns nothing', () => {
  const { ctx, npd } = setup();
  const r = ctx.PC_API.updateNpd(npd.id, JSON.parse(JSON.stringify(npd)));
  assert.equal(r.status, 'success', r.message);
  assert.deepEqual([...r.returned], []);
  assert.ok(ctx.PC_COUNTER.entryOf('121021', 'item'));
});

test('opening the NPD list or Product Master clears old codes stuck from an earlier category change without a re-save', () => {
  for (const open of ['getNPDList', 'getMasterDataExtended']) {
    const { ctx, data, npd, item } = setup();
    const saved = JSON.parse(data.get('pc_mock_store_v28'));
    saved.npd[0].items = [item('115028', '115', 'SAUCE & TOPPING'), item('115029', '115', 'SAUCE & TOPPING')];
    data.set('pc_mock_store_v28', JSON.stringify(saved));
    ctx.PC_API.reloadFromStorage();
    ctx.PC_API[open]();
    const codes = ctx.PC_API.getNpdProducts().map(p => p.itemCode);
    assert.ok(!codes.includes('121021') && !codes.includes('121022'), open);
    assert.ok(codes.includes('121099'), open);
    assert.equal(ctx.PC_COUNTER.entryOf('121021', 'item'), null, open);
    assert.equal(ctx.PC_COUNTER.entryOf('121022', 'item'), null, open);
    assert.ok(!(JSON.parse(data.get('pc_mock_store_v28')).npdProducts || []).some(p => p.itemCode === '121021'), open + ' persisted');
  }
});
