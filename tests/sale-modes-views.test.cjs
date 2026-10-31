const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const MASTER = [
  { name: 'Take Away', active: 1 }, { name: 'Grab', active: 1 }, { name: 'LINE MAN', active: 1 },
  { name: 'Wongnai Express', active: 1, custom: true, type: 'dlv' }, { name: 'Robinhood', active: 0 }
];
function load(file, master) {
  const store = new Map([['pc_salemode_master', JSON.stringify(master || MASTER)]]);
  const c = { console, setTimeout() {}, clearTimeout() {}, navigator: {},
    localStorage: { getItem: k => store.get(k) ?? null, setItem() {} },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} } } };
  c.window = c; vm.createContext(c);
  vm.runInContext(fs.readFileSync('js/sale-modes.js', 'utf8'), c);
  vm.runInContext(fs.readFileSync(file, 'utf8'), c);
  return c;
}
const esc = s => String(s == null ? '' : s);
const item = { name: 'Fries', saleModes: ['Take-Away', 'Grab', 'Wongnai Express', 'Robinhood'],
  prices: { 'Take-Away': '49', Grab: '59', 'Wongnai Express': '61', Robinhood: '60' } };

for (const [file, fn] of [['js/op-tracking.js', 'npdDetailHTMLOp'], ['js/campaign-tracking.js', 'npdDetailHTML']]) {
  test(`${file}: delivery tags and prices follow Sale mode settings; switched-off channels are hidden even on old records`, () => {
    const c = load(file);
    const html = c[fn]({ items: [item], subsets: [] }, esc);
    assert.match(html, /Wongnai Express DLV/, 'a channel added in settings is tagged as delivery');
    assert.doesNotMatch(html, /Robinhood/, 'a channel switched off in settings is not shown on working pages');
    assert.doesNotMatch(html, /Take-Away DLV/);
    assert.match(html, /Wongnai Express ฿?61/);
  });
}

test('campaign tracking price lookup works for added channels and alias spellings', () => {
  const c = load('js/campaign-tracking.js');
  const p = { priceTA: '49', priceDLV: '55', prices: { Lineman: '58', 'Wongnai Express': '61', Panda: '57' } };
  assert.equal(c.ctPriceFor(p, 'LINE MAN'), '58');
  assert.equal(c.ctPriceFor(p, 'Wongnai Express'), '61');
  assert.equal(c.ctPriceFor(p, 'foodpanda'), '57');
  assert.equal(c.ctPriceFor({ priceTA: '49', priceDLV: '55', prices: {} }, 'Wongnai Express'), '55', 'delivery price when the item has no price for the new channel');
  assert.equal(c.ctPriceFor(p, 'Take Away'), '49');
});
