const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(store) {
  const saved = new Map(Object.entries(store || {}).map(([k, v]) => [k, JSON.stringify(v)]));
  const c = { localStorage: { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, String(v)) } };
  c.window = c; vm.createContext(c);
  vm.runInContext(fs.readFileSync('js/sale-modes.js', 'utf8'), c);
  const S = c.PC_SaleModes, plain = f => (...a) => [...f(...a)];
  return { ...S, names: plain(S.names), deliveries: plain(S.deliveries) };
}

test('spellings used across pages resolve to the same channel', () => {
  const S = load();
  assert.ok(S.same('LINE MAN', 'Lineman'));
  assert.ok(S.same('LINEMAN', 'lineman'));
  assert.ok(S.same('Take Away', 'Take-Away'));
  assert.ok(S.same('Panda', 'foodpanda'));
  assert.equal(S.same('Grab', 'Gokoo'), false);
  assert.equal(S.canonical('LINE MAN'), 'Lineman');
});

test('a channel added in settings appears everywhere with its type', () => {
  const S = load({ pc_salemode_master: [{ name: 'Take Away', active: 1 }, { name: 'Grab', active: 1 }, { name: 'Wongnai Express', active: 1, custom: true, type: 'dlv' }, { name: 'Kiosk', active: 1, custom: true, type: 'ta' }] });
  assert.deepEqual(S.names('proposal'), ['Take Away', 'Grab', 'Wongnai Express', 'Kiosk']);
  assert.ok(S.isDelivery('Wongnai Express'));
  assert.ok(S.isTakeAway('Kiosk'));
  assert.deepEqual(S.deliveries('it'), ['Grab', 'Wongnai Express']);
});

test('a channel switched off or hidden for one form disappears there, but stays on records that use it', () => {
  const S = load({
    pc_salemode_master: [{ name: 'Take Away', active: 1 }, { name: 'Grab', active: 1 }, { name: 'Robinhood', active: 0 }, { name: 'Gokoo', active: 1 }],
    pc_mode_forms: { Gokoo: { coupon: false } }
  });
  assert.deepEqual(S.names('coupon'), ['Take Away', 'Grab']);
  assert.deepEqual(S.names('proposal'), ['Take Away', 'Grab', 'Gokoo']);
  assert.deepEqual(S.names('coupon', { include: ['ROBINHOOD'] }), ['Take Away', 'Grab', 'Robinhood']);
  assert.deepEqual(S.names('view'), ['Take Away', 'Grab', 'Gokoo']);
});

test('pages keep their stored spelling for known channels and group labels are not channels', () => {
  const S = load({ pc_salemode_master: [{ name: 'Take Away', active: 1 }, { name: 'Delivery', active: 1 }, { name: 'Lineman', active: 1 }] });
  assert.deepEqual(S.names('itemset', { spell: { 'Take-Away': 'Take Away', Lineman: 'LINEMAN' } }), ['Take Away', 'LINEMAN']);
  assert.ok(S.isDelivery('ALL DELIVERY'));
  assert.ok(S.isAggregate('ALL CHANNEL'));
});

test('without saved settings the standard channels are used', () => {
  const S = load();
  assert.deepEqual(S.names('npd'), ['Take-Away', 'Grab', 'Lineman', 'ShopeeFood', 'Robinhood', 'foodpanda', 'Gokoo']);
});
