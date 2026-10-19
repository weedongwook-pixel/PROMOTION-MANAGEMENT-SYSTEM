const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pages', 'IT_Settlement.html'), 'utf8');
const start = html.indexOf('  function itUniqueButtonCode(');
const end = html.indexOf('  window.itItemSetChanged = function', start);
assert.ok(start >= 0 && end > start, 'IT button-code fallback must exist');
const code = vm.runInNewContext(`${html.slice(start, end)}; itUniqueButtonCode`);

const rows = [
  { shortName: 'LM-EXGoodie[129]', promoCode: '', itemPromo: '', builderCode: '' },
  { shortName: '', promoCode: '', itemPromo: '', builderCode: '' },
  { shortName: 'LM-EXGoodie[129]', promoCode: 'P3664', itemPromo: '1073552', builderCode: '1073552' },
  { shortName: 'OTHER', promoCode: 'P9000', itemPromo: '1079000', builderCode: '1079000' },
];

assert.equal(code(rows, 'LM-EXGoodie[129]', ['promoCode'], /^[A-Z]{1,3}\d+$/i), 'P3664');
assert.equal(code(rows, 'LM-EXGoodie[129]', ['itemPromo', 'builderCode'], /^10[5-9]\d{3,}$/), '1073552');
assert.equal(code([...rows, { shortName: 'LM-EXGoodie[129]', promoCode: 'P3665' }],
  'LM-EXGoodie[129]', ['promoCode'], /^[A-Z]{1,3}\d+$/i), '', 'conflicting codes must not be auto-selected');

console.log('Extended IT button keeps a unique existing code: OK');
