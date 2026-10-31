const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const MASTER = [{ name: 'Take Away', active: 1 }, { name: 'Delivery', active: 1 }, { name: 'Grab', active: 1 }, { name: 'LINE MAN', active: 1 },
  { name: 'Robinhood', active: 0 }, { name: 'Wongnai Express', active: 1, custom: true, type: 'dlv' }];

function context(withHelper, extra) {
  const saved = new Map([['pc_salemode_master', JSON.stringify(MASTER)]]);
  const c = Object.assign({ localStorage: { getItem: k => saved.get(k) ?? null } }, extra || {});
  c.window = c; vm.createContext(c);
  if (withHelper) vm.runInContext(fs.readFileSync('js/sale-modes.js', 'utf8'), c);
  return c;
}
function slice(file, from, to) { const s = fs.readFileSync(file, 'utf8'); const a = s.indexOf(from), b = s.indexOf(to, a); assert.ok(a >= 0 && b > a, file + ': ' + from); return s.slice(a, b); }
// Item Set: only the channel definitions and the two helper functions.
const itemSetModes = () => { const s = fs.readFileSync('pages/ItemSet.html', 'utf8'), a = s.indexOf('var IS_DEF_MODES'), b = s.indexOf('\n', s.indexOf('function isDlv(){')); assert.ok(a >= 0 && b > a); return s.slice(a, b); };
const plain = v => JSON.parse(JSON.stringify(v));

test('Item Set lists channels from settings in its stored spelling and hides a record\'s switched-off channel', () => {
  const c = context(true, { store: { set: { saleModes: ['GRAB', 'Robinhood'] } } });
  vm.runInContext(itemSetModes(), c);
  assert.deepEqual(plain(c.isModes()), ['Take Away', 'GRAB', 'LINEMAN', 'Wongnai Express']);
  assert.deepEqual(plain(c.isDlv()), ['GRAB', 'LINEMAN', 'Wongnai Express']);
  const legacy = context(false, { store: { set: { saleModes: [] } } });
  vm.runInContext(itemSetModes(), legacy);
  assert.deepEqual(plain(legacy.isModes()), ['Take Away', 'GRAB', 'LINEMAN', 'ShopeeFood', 'Robinhood', 'Gokoo']);
});

test('IT Settlement shows only active channels (a switched-off one is hidden even on the item) and classifies new delivery channels', () => {
  const c = context(true);
  vm.runInContext(slice('pages/IT_Settlement.html', 'var IT_DEF_CHANNELS', 'function itEditItem'), c);
  assert.deepEqual(plain(c.itChannels(['Take-Away', 'Robinhood'])), ['Take-Away', 'Grab', 'Lineman', 'Wongnai Express']);
  assert.ok(c.itIsDlv('Wongnai Express'));
  assert.ok(c.itIsDlv('LINE MAN'));
  assert.ok(c.itIsTA('Take Away'));
  assert.equal(c.itIsDlv('Take-Away'), false);
});

test('NPD read-only view uses settings and hides switched-off channels stored on the item', () => {
  const c = context(true);
  vm.runInContext(slice('js/npd-readonly-view.js', 'var DLV =', 'function normCh'), c);
  assert.deepEqual(plain(c.viewChannels(['Robinhood'])), ['Take-Away', 'Grab', 'Lineman', 'Wongnai Express']);
  assert.deepEqual(plain(c.dlvChannels()), ['Grab', 'Lineman', 'Wongnai Express']);
  assert.ok(c.isDlvCh('Wongnai Express'));
});

test('Flavor offers channels from settings, hides switched-off ones even when a target chose them, and splits delivery by type', () => {
  const c = context(true, { groupSale: { SS0001: ['Robinhood'] } });
  vm.runInContext(slice('pages/Flavor.html', 'var NPD_CH_DEF', '/* Subset ปลายทางนี้'), c);
  assert.deepEqual(plain(c.flvChannels()), ['Take-Away', 'Grab', 'Lineman', 'Wongnai Express']);
  assert.deepEqual(plain(c.flvDelivery()), ['Grab', 'Lineman', 'Wongnai Express']);
});
