const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Item Set POS shows every direct Subset while Recipe RM only uses real product members', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../pages/ItemSet.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', value: '', scrollTop: 0 });
    return elements.get(id);
  };
  const storage = new Map([
    ['pc_itemset_comp', JSON.stringify({ '101003': [{ code: 'SS0001', min: 2, max: 2 }] })],
    ['pc_subset_powders', JSON.stringify({ SS0001: ['103013'] })],
  ]);
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  const button = { campaign: 'Test campaign', shortName: 'Test set', month: '2026-10', saleMode: 'Take Away', codeItemSet: '1079999', itStatus: 'COMPLETE' };
  const items = [
    { shortName: 'Test set', itemCode: '101003', itemNameEn: 'Mega Fries', qty: 2, price: 100 },
    { shortName: 'Test set', itemCode: 'SS0035', itemNameEn: 'Drink All', isSubset: 'Y', chooseMin: '1', chooseMax: '3', qty: 1, price: 20 },
    { shortName: 'Test set', itemCode: 'SS0136', itemNameEn: 'Sauce <all>', isSubset: 'Y', chooseMin: '2', chooseMax: '2', qty: 2, price: 10 },
  ];
  const api = { getItemSetButtons: () => [button], getPromoDetails: () => ({ items }), getMasterDataExtended: () => ({ items: [
    { itemCode: '101003', itemNameEN: 'Mega Fries' },
    { itemCode: '103013', itemNameEN: 'Cheese <b>FF1' },
    { itemCode: '103014', itemNameEN: 'Hidden powder', ssCode: 'SS0001', category: 'Flavors' },
  ] }) };
  const exports = [];
  const document = {
    addEventListener() {},
    getElementById: element,
    querySelectorAll: () => [element('posTree'), element('recTree')],
    createElement: () => ({ click() {}, remove() {} }),
    body: { appendChild() {} },
  };
  const window = {
    PC_SEED: { items: [{ itemCode: '101003', itemNameEN: 'Mega Fries', category: 'Food' }] },
    PC_PRODUCT_FORMULA: { '101003': [{ code: 'SS0001', min: 1, max: 2 }] },
    PC_SUBSET_MASTER: [{ ssCode: 'SS0001', name: 'Flavor' }, { ssCode: 'SS0035', name: 'Drink All' }],
    PC_SUBSET_FLAVORS: { SS0001: { flavors: [{ code: '103013', flavor: 'Cheese FF1' }, { code: '103014', flavor: 'Hidden powder' }] } },
    PC_RECIPE: { '101003': { modes: { 'Take Away': [{ rm: '3116', d: 'Potatoes', q: '100', u: 'G' }] } } },
    PC_API: api,
  };
  const context = {
    window, document, localStorage, PC_API: api, PC_SEED: window.PC_SEED,
    PC_RECIPE: window.PC_RECIPE, Blob, URL: { createObjectURL: blob => { exports.push(blob); return 'blob:test'; } }, console,
    navigator: { clipboard: { writeText: async text => { copied.push(text); } } },
    setTimeout: fn => fn(),
  };
  const copied = [];
  vm.runInNewContext(script, context, { filename: 'ItemSet.html' });

  context.App.posPick('Test campaign', 'Test set');

  assert.match(element('posBody').innerHTML, /฿240/);
  assert.match(element('posBody').innerHTML, /<th scope="col">Description 1<\/th><th scope="col">Min<\/th><th scope="col">Max<\/th><th scope="col">อ้างอิงสินค้า<\/th>/);
  assert.doesNotMatch(element('posBody').innerHTML, /Description 2/);
  assert.match(element('posBody').innerHTML, /<tr class="pos-powder-total">[\s\S]*?SS0001[\s\S]*?<td class="fw-bold">4<\/td><td class="fw-bold">4<\/td>[\s\S]*?101003[\s\S]*?Mega Fries[\s\S]*?2 × 2/);
  assert.doesNotMatch(element('posBody').innerHTML, /สูตรผงของสินค้าสมาชิก|Cheese &lt;b&gt;FF1|Hidden powder/);
  assert.match(element('posBody').innerHTML, /รายการจากฟอร์มแจ้งโปรฯ/);
  assert.match(element('posBody').innerHTML, /Subset 3/);
  assert.doesNotMatch(element('posBody').innerHTML, /<tr><td>สินค้า<\/td>/);
  const subsetCopyCodes = [...element('posBody').innerHTML.matchAll(/class="btn btn-outline-secondary btn-sm pos-subset-copy"[^>]*data-copy="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(subsetCopyCodes, ['SS0035', 'SS0136', 'SS0001']);
  const copyButton = { innerHTML: '<i class="fas fa-copy"></i>', classList: { add() {}, remove() {} } };
  for (const code of subsetCopyCodes) context.App.copyText(code, copyButton);
  await Promise.resolve();
  assert.deepEqual(copied, ['SS0035', 'SS0136', 'SS0001']);
  assert.match(element('posBody').innerHTML, /SS0035/);
  assert.match(element('posBody').innerHTML, /1–3/);
  assert.match(element('posBody').innerHTML, /SS0136/);
  assert.match(element('posBody').innerHTML, /Sauce &lt;all&gt;/);
  assert.match(element('posBody').innerHTML, /<td>4<\/td><td>4<\/td><td class="small text-muted">จากฟอร์มแจ้งโปรฯ/);
  assert.match(element('posBody').innerHTML, /งานถูกบันทึกเป็น COMPLETE/);
  const recipe = JSON.parse(element('posJson').textContent);
  assert.equal(recipe.length, 1);
  assert.equal(recipe[0].code, '101003');
  assert.equal(recipe[0].rm, '3116');
  assert.doesNotMatch(element('posJson').textContent, /SS0001|SS0035|SS0136/);
  assert.doesNotMatch(element('recBody').innerHTML, /SS0001|SS0035|SS0136|สูตรผงของสินค้าสมาชิก/);

  context.App.posExport();
  context.App.recExport();
  assert.equal(exports.length, 2);
  for (const blob of exports) {
    const csv = await blob.text();
    assert.match(csv, /101003/);
    assert.match(csv, /3116/);
    assert.doesNotMatch(csv, /SS0001|SS0035|SS0136|Subset Code/);
  }

  storage.delete('pc_subset_powders');
  context.App.posPick('Test campaign', 'Test set');
  assert.match(element('posBody').innerHTML, /<tr class="pos-powder-total">[\s\S]*?SS0001[\s\S]*?<td class="fw-bold">4<\/td><td class="fw-bold">4<\/td>/);
  assert.doesNotMatch(element('posBody').innerHTML, /สูตรผงของสินค้าสมาชิก|Hidden powder/);

  storage.set('pc_itemset_comp', JSON.stringify({ '101003': [] }));
  context.App.posPick('Test campaign', 'Test set');
  assert.doesNotMatch(element('posBody').innerHTML, /สูตรผงของสินค้าสมาชิก|ยังไม่มีสูตรผงที่ผูกไว้|SS0001/);

  storage.delete('pc_itemset_comp');
  storage.set('pc_subset_items', JSON.stringify({ SS0035: ['101003'] }));
  context.App.posPick('Test campaign', 'Test set');
  assert.match(element('posBody').innerHTML, /<tr class="pos-powder-total">[\s\S]*?SS0001[\s\S]*?<td class="fw-bold">2<\/td><td class="fw-bold">4<\/td>/);
  assert.doesNotMatch(element('posBody').innerHTML, /สูตรผงของสินค้าสมาชิก/);
  assert.match(element('posBody').innerHTML, /SS0035/);
  assert.doesNotMatch(element('posJson').textContent, /SS0001|SS0035|SS0136/);

  items.splice(1);
  context.App.posPick('Test campaign', 'Test set');
  const posSubsetSection = element('posBody').innerHTML.match(/<section class="pos-proposal[\s\S]*?<\/section>/)[0];
  assert.match(posSubsetSection, /Subset 1/);
  assert.doesNotMatch(posSubsetSection, /<tr><td>สินค้า<\/td>/);
  assert.doesNotMatch(posSubsetSection, /SS0035|SS0136/);

  button.itStatus = 'PENDING';
  const source = { ...button, campaign: 'Source campaign', codeItemSet: '1078888' };
  const sourceItems = [items[0], { shortName: 'Test set', itemCode: 'SS0035', isSubset: 'Y', chooseMin: '1', chooseMax: '3' }];
  api.getItemSetButtons = () => [button, source];
  api.getPromoDetails = campaign => ({ items: campaign === 'Source campaign' ? sourceItems : items });
  context.App.posPick('Test campaign', 'Test set');
  assert.doesNotMatch(element('posBody').innerHTML, /ปุ่มนี้มี item เหมือนกับ/);
  sourceItems.pop();
  context.App.posPick('Test campaign', 'Test set');
  assert.match(element('posBody').innerHTML, /ปุ่มนี้มี item เหมือนกับ/);

  // Campaign details collapse repeated codes; the Item Set page must use the
  // exact proposal rows so neither of these two submitted Subset rows vanishes.
  api.getItemSetProposalRows = campaign => campaign === 'Test campaign' ? [
    items[0],
    { shortName: 'Test set', itemCode: 'SS0035', itemNameEn: 'Drink All', isSubset: 'Y', chooseMin: '1', chooseMax: '2', qty: 1 },
    { shortName: 'Test set', itemCode: 'SS0035', itemNameEn: 'Drink All', isSubset: 'Y', chooseMin: '2', chooseMax: '3', qty: 2 },
  ] : [];
  context.App.posPick('Test campaign', 'Test set');
  const exactRows = element('posBody').innerHTML.match(/<section class="pos-proposal[\s\S]*?<\/section>/)[0];
  assert.match(exactRows, /Subset 3/);
  assert.equal((exactRows.match(/data-copy="SS0035"/g) || []).length, 2);
  assert.match(exactRows, /<td>4<\/td><td>6<\/td><td class="small text-muted">จากฟอร์มแจ้งโปรฯ/);
  assert.equal(JSON.parse(element('posJson').textContent).length, 1);
  assert.doesNotMatch(element('recBody').innerHTML, /SS0035|สูตรผง/);

  // The same powder group across repeated product rows is totaled once,
  // while directly submitted Subsets remain separate button rows.
  storage.set('pc_itemset_comp', JSON.stringify({ '101003': [{ code: 'SS0001', min: 2, max: 2 }] }));
  api.getItemSetProposalRows = () => [items[0], { ...items[0], qty: 1 }];
  context.App.posPick('Test campaign', 'Test set');
  const summedRows = element('posBody').innerHTML.match(/<section class="pos-proposal[\s\S]*?<\/section>/)[0];
  assert.equal((summedRows.match(/class="pos-powder-total"/g) || []).length, 1);
  assert.match(summedRows, /<td class="fw-bold">6<\/td><td class="fw-bold">6<\/td>[\s\S]*?101003[\s\S]*?3 × 2/);
  assert.doesNotMatch(element('posJson').textContent, /SS0001/);
  assert.doesNotMatch(element('recBody').innerHTML, /SS0001/);

  storage.set('pc_itemset_comp', JSON.stringify({
    '101003': [{ code: 'SS0001', min: 2, max: 2 }],
    '101004': [{ code: 'SS0001', min: 1, max: 3 }],
  }));
  api.getItemSetProposalRows = () => [items[0], { shortName: 'Test set', itemCode: '101004', itemNameEn: 'Another Fries', qty: 1 }];
  context.App.posPick('Test campaign', 'Test set');
  const combinedRows = element('posBody').innerHTML.match(/<section class="pos-proposal[\s\S]*?<\/section>/)[0];
  assert.equal((combinedRows.match(/class="pos-powder-total"/g) || []).length, 1);
  assert.match(combinedRows, /<td class="fw-bold">5<\/td><td class="fw-bold">7<\/td>[\s\S]*?101003[\s\S]*?101004/);
  assert.doesNotMatch(element('posJson').textContent, /SS0001/);
});

test('IT completion retains each direct Subset choice range in the Item Set button link', () => {
  const month = '2026-10';
  const campaign = 'Subset campaign';
  const shortName = 'Subset button';
  const base = { month, campaign, shortName, typePromotion: 'Item Set', promoType: 'Item Set',
    saleMode: 'Take Away', cateRemark: 'Promotion set', stores: 'ALL', itStatus: 'PENDING', qty: '1' };
  const rows = [
    { ...base, itemCode: '101003', itemNameEN: 'Mega Fries', gross: '100' },
    { ...base, itemCode: 'SS0035', itemNameEN: 'Drink All', isSubset: 'Y', chooseMin: '2', chooseMax: '3', gross: '0' },
    { ...base, itemCode: 'SS0136', itemNameEN: 'Sauce All', isSubset: 'Y', chooseMin: '1', chooseMax: '2', gross: '0' },
    { ...base, itemCode: 'SS0035', itemNameEN: 'Drink All', isSubset: 'Y', chooseMin: '1', chooseMax: '2', qty: '2', gross: '0' },
  ];
  const storage = new Map([['pc_mock_store_v28', JSON.stringify({ months: { [month]: rows },
    _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1 })]]);
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    key: index => [...storage.keys()][index] ?? null,
    get length() { return storage.size; },
  };
  const sandbox = { localStorage, console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, location: { href: 'http://test/' },
    fetch() { throw new Error('unexpected fetch'); }, URL, Date, Math };
  sandbox.window = sandbox;
  sandbox.PC_REAL_PROMOS = [];
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), sandbox);
  const proposalRows = sandbox.PC_API.getItemSetProposalRows(campaign, shortName, month);
  assert.equal(proposalRows.length, 4);
  assert.equal(proposalRows.filter(r => r.itemCode === 'SS0035').length, 2);
  const updates = rows.map((row, index) => ({ month, campaign, shortName, sourceShortName: shortName,
    rowIdx: String(index + 2), promoType: 'Item Set', promoCode: 'P9999', itemPromo: '1079999',
    kitchenName: shortName, itemCode: row.itemCode, itemNameEN: row.itemNameEN, qty: row.qty,
    price: row.gross, discount: '0', netPrice: '100', cateRemark: 'Promotion set' }));
  assert.equal(sandbox.PC_API.saveSettlementBatch(month, updates), 'SUCCESS');
  const links = JSON.parse(storage.get('pc_itemset_comp'))['1079999'];
  assert.deepEqual(links.map(link => ({ code: link.code, min: link.min, max: link.max })), [
    { code: '101003', min: 1, max: 1 },
    { code: 'SS0035', min: 4, max: 7 },
    { code: 'SS0136', min: 1, max: 2 },
  ]);
  assert.equal(sandbox.PC_API.getPromoDetails(campaign).items.filter(r => r.itemCode === 'SS0035').length, 1);
  assert.equal(sandbox.PC_API.getItemSetProposalRows(campaign, shortName, month).filter(r => r.itemCode === 'SS0035').length, 2);
});
