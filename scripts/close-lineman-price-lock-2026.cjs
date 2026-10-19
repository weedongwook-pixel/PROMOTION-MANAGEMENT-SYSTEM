// One-off, audited completion of the confirmed P3114 / 1073033 legacy reuse.
// Dry-run by default. --apply uses one conditional D1 UPDATE for all related keys.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const wrangler = '/Users/oneday/.npm/_npx/d77349f55c2be1c0/node_modules/.bin/wrangler';
const syncDir = path.join(root, 'sync-worker');
const campaign = 'Lineman - ดีลล็อคราคา (2026)';
const sourceCampaign = 'ดีลล็อคLCS';
const sourceShort = 'LM-ดีลล็อคLCS[59]';
const firstShort = 'LM-ดีลล็อคLCS[55]';
const secondShort = 'LM-FDsupertera[179]';
const targetKey = 'promo::c::' + encodeURIComponent(campaign);
const sourceKey = 'promo::c::' + encodeURIComponent(sourceCampaign);
const keys = [targetKey, 'promo::meta', 'pc_product_promo', 'pc_product_promo::_ts', 'pc_itemset_comp', 'pc_itemset_comp::_ts'];
const q = value => "'" + String(value).replace(/'/g, "''") + "'";

function query(sql) {
  const output = execFileSync(wrangler, ['d1', 'execute', 'potato-promo', '--remote', '--json', '--command', sql], {
    cwd: syncDir, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
  });
  const result = JSON.parse(output)[0];
  assert.equal(result.success, true);
  return result.results || [];
}

const records = query(`SELECT k,updated_at,CASE WHEN k IN (${q(targetKey)},${q(sourceKey)}) THEN v ELSE NULL END AS v
  FROM promo_store WHERE k IN (${[...keys, sourceKey].map(q).join(',')})`);
const byKey = Object.fromEntries(records.map(row => [row.k, row]));
assert.equal(records.length, keys.length + 1, 'a required Cloud key is missing');
const target = JSON.parse(byKey[targetKey].v);
const source = JSON.parse(byKey[sourceKey].v);
const month = '2026-10';
const rows = target.m?.[month];
assert.equal(rows?.length, 3, 'target item rows changed');
assert.deepEqual(rows.map(row => row.itemCode), ['108009', '101003', '104003']);
assert.deepEqual(rows.map(row => row.shortName), [firstShort, secondShort, '']);
assert.equal(rows[0].codePromotion, 'P3114');
assert.equal(rows[0].codeItemSet, '1073589');
assert.equal(rows[1].codePromotion, 'P3652');
assert.equal(rows[1].codeItemSet, '1073538');
assert.ok(rows.every(row => row.itStatus === 'PENDING'), 'work status changed');
const sourceMonths = source.m || {};
assert.ok(Object.values(sourceMonths).flat().some(row =>
  row.shortName === sourceShort && row.codePromotion === 'P3114' && row.itemCode === '1073033' && row.itStatus === 'COMPLETE'
), 'legacy source no longer matches');
const occupied = query(`SELECT p.k, j.key AS idx, json_extract(j.value,'$.campaign') AS campaign,
    json_extract(j.value,'$.shortName') AS short_name
  FROM promo_store p, json_each(p.v,'$.w') j
  WHERE p.k LIKE 'promo::c::%' AND (
    json_extract(j.value,'$.codeItemSet') IN ('1073033','1073538') OR
    json_extract(j.value,'$.codePromotion') IN ('P3114','P3652'))`);
assert.ok(occupied.every(row => row.campaign === campaign || row.campaign === sourceCampaign), 'another campaign owns a requested code');
const related = query(`SELECT k,
    CASE WHEN k='pc_product_promo' THEN json_extract(v,'$."1073033"') END AS promo3033,
    CASE WHEN k='pc_product_promo' THEN json_extract(v,'$."1073538"') END AS promo3538,
    CASE WHEN k='pc_itemset_comp' THEN json_extract(v,'$."1073033"') END AS comp3033,
    CASE WHEN k='pc_itemset_comp' THEN json_extract(v,'$."1073538"') END AS comp3538,
    CASE WHEN k='promo::meta' THEN (SELECT count(*) FROM json_each(v,'$.npdProducts') WHERE json_extract(value,'$.itemCode')='1073538') END AS product3538
  FROM promo_store WHERE k IN ('pc_product_promo','pc_itemset_comp','promo::meta')`);
assert.ok(related.every(row => !row.promo3033 && !row.promo3538 && !row.comp3033 && !row.comp3538 && !row.product3538), 'related Cloud records changed');

// Run the same application path on a minimal copy before preparing Cloud edits.
const months = Object.assign({}, sourceMonths, target.m);
const data = new Map([
  ['pc_mock_store_v28', JSON.stringify({
    months, npdProducts: [], _npdSeeded: true, _flvSeeded: true,
    _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
    _billDiscVer: 4, _proJulyVer: 2, _vcCouponVer: 2
  })],
  ['pc_product_promo', '{}'], ['pc_itemset_comp', '{}']
]);
const localStorage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: key => data.delete(key),
  key: index => [...data.keys()][index] || null,
  get length() { return data.size; }
};
const sandbox = {
  localStorage, console: { log() {}, warn() {}, error() {} },
  setTimeout() {}, clearTimeout() {}, location: { href: 'http://test/' },
  fetch() { throw new Error('unexpected fetch'); }, URL, Date, Math,
  PC_ITEM_MASTER: [{ itemCode: '1073033', itemNameEN: 'LCS', itemType: 'Item Set' }]
};
sandbox.window = sandbox;
vm.createContext(sandbox);
const backend = fs.readFileSync(path.join(root, 'js', 'mock-backend.js'), 'utf8');
assert.ok(backend.includes('  let store = loadStore();'));
vm.runInContext(backend.replace('  let store = loadStore();',
  '  let store = loadStore(); window.__readSimulatedStore = () => store;'), sandbox);
const api = sandbox.PC_API;
assert.equal(api.getItemSetButtons().find(button => button.campaign === sourceCampaign && button.shortName === sourceShort)?.codeItemSet, '1073033');
assert.equal(api.savePosButton(campaign, firstShort, '1073033', { fromCamp: sourceCampaign, fromShort: sourceShort }).status, 'success');
assert.equal(api.confirmPosReuse(campaign, firstShort, '1073033').status, 'success');
const update = (rowIdx, sourceName, buttonName, promoCode, itemSet, kitchen, netPrice) => ({
  rowIdx: String(rowIdx + 2), campaign, month, sourceShortName: sourceName, shortName: buttonName,
  promoType: 'Price Promotion', promoCode, itemPromo: itemSet, kitchenName: kitchen,
  itemCode: rows[rowIdx].itemCode, itemNameEN: rows[rowIdx].itemNameEN,
  qty: String(rows[rowIdx].qty || 1), price: String(rows[rowIdx].gross || ''),
  discount: String(rows[rowIdx].discount || ''), netPrice: String(netPrice),
  cateRemark: rows[0].cateRemark || 'Promotion set'
});
const updates = [
  update(0, firstShort, firstShort, 'P3114', '1073033', 'LCS', 55),
  update(1, secondShort, secondShort, 'P3652', '1073538', 'MFF+MCK', 179),
  update(2, '', secondShort, 'P3652', '1073538', 'MFF+MCK', 179)
];
assert.equal(api.saveSettlementBatch(month, updates), 'SUCCESS');
const saved = JSON.parse(data.get('pc_mock_store_v28'));
const simulatedStore = sandbox.__readSimulatedStore();
const nextRows = saved.months[month];
assert.ok(nextRows.every(row => row.itStatus === 'COMPLETE' && row.itDoneDate));
assert.deepEqual(nextRows.map(row => row.codeItemSet || row.itemPromotion), ['1073033', '1073538', '1073538']);
assert.deepEqual(nextRows.map(row => row.shortName), [firstShort, secondShort, secondShort]);
assert.deepEqual(saved.months[sourceMonths && Object.keys(sourceMonths)[0]], sourceMonths[Object.keys(sourceMonths)[0]], 'old campaign changed');
const newProduct = saved.npdProducts.find(row => row.itemCode === '1073538');
assert.ok(newProduct, 'new Item Set product was not produced');
assert.equal(saved.npdProducts.some(row => row.itemCode === '1073033'), false, 'legacy product must not be overwritten');
const promos = JSON.parse(data.get('pc_product_promo'));
const components = JSON.parse(data.get('pc_itemset_comp'));
assert.equal(promos['1073033'][0].prCode, 'P3114');
assert.equal(promos['1073538'][0].prCode, 'P3652');
assert.deepEqual(components['1073538'].map(row => row.code), ['101003', '104003']);
assert.equal(components['1073033'], undefined);
const now = Date.now();
const nextBlock = { w: simulatedStore.working.filter(row => row.campaign === campaign), m: { [month]: nextRows }, _ts: now };
assert.equal(nextBlock.w.length, 2);

console.log(JSON.stringify({
  mode: process.argv.includes('--apply') ? 'apply' : 'dry-run',
  campaign, pair: 'P3114 / 1073033', secondPair: 'P3652 / 1073538',
  monthRows: nextRows.length, buttonRows: nextBlock.w.length,
  productAdded: newProduct.itemCode, componentCodes: components['1073538'].map(row => row.code),
  oldCampaignUnchanged: true, supersededCode1073589RemainsLocked: true,
  cloudVersion: byKey[targetKey].updated_at
}, null, 2));

if (!process.argv.includes('--apply')) process.exit(0);
const expected = keys.map(k => `(k=${q(k)} AND updated_at=${Number(byKey[k].updated_at)})`).join(' OR ');
const nextValue = `CASE k
  WHEN ${q(targetKey)} THEN ${q(JSON.stringify(nextBlock))}
  WHEN 'promo::meta' THEN json_insert(v,'$.npdProducts[#]',json(${q(JSON.stringify(newProduct))}))
  WHEN 'pc_product_promo' THEN json_set(v,'$."1073033"',json(${q(JSON.stringify(promos['1073033']))}),'$."1073538"',json(${q(JSON.stringify(promos['1073538']))}))
  WHEN 'pc_itemset_comp' THEN json_set(v,'$."1073538"',json(${q(JSON.stringify(components['1073538']))}))
  WHEN 'pc_product_promo::_ts' THEN ${q(String(now))}
  WHEN 'pc_itemset_comp::_ts' THEN ${q(String(now))}
END`;
const changed = query(`UPDATE promo_store SET v=${nextValue},
  updated_at=CASE WHEN updated_at>=${now} THEN updated_at+1 ELSE ${now} END
  WHERE (${expected}) AND (SELECT count(*) FROM promo_store WHERE ${expected})=${keys.length}`);
assert.ok(changed.length === 0, 'unexpected UPDATE result');
const verified = query(`SELECT
  (SELECT json_extract(v,'$.w[0].itStatus') FROM promo_store WHERE k=${q(targetKey)}) AS firstStatus,
  (SELECT json_extract(v,'$.w[0].codeItemSet') FROM promo_store WHERE k=${q(targetKey)}) AS firstItemSet,
  (SELECT json_extract(v,'$.w[1].itStatus') FROM promo_store WHERE k=${q(targetKey)}) AS secondStatus,
  (SELECT json_extract(v,'$."1073538"[1].code') FROM promo_store WHERE k='pc_itemset_comp') AS secondMember,
  (SELECT json_extract(v,'$."1073033"[0].prCode') FROM promo_store WHERE k='pc_product_promo') AS firstPromo,
  (SELECT count(*) FROM promo_store p,json_each(p.v,'$.npdProducts') j WHERE p.k='promo::meta' AND json_extract(j.value,'$.itemCode')='1073538') AS productCount`)[0];
assert.deepEqual({ ...verified }, {
  firstStatus: 'COMPLETE', firstItemSet: '1073033', secondStatus: 'COMPLETE',
  secondMember: '104003', firstPromo: 'P3114', productCount: 1
});
console.log('Cloud verification: COMPLETE for both buttons; product, promotion bindings, and both components present.');
