const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/memo.js'), 'utf8');

function loadMemo(campaign) {
  const fields = new Map();
  const getField = id => {
    if (!fields.has(id)) fields.set(id, { value: '', innerHTML: '' });
    return fields.get(id);
  };
  const context = {
    document: { getElementById: getField },
    google: { script: { run: {
      withSuccessHandler(callback) {
        return { getMemoCampaigns() { callback([campaign]); } };
      }
    } } },
    Swal: { fire() {} },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'memo.js' });
  context.memoRenderBlocks = () => {};
  context.memoRenderBtnRows = () => {};
  context.memoRenderStatus = () => {};
  getField('memoMonth').value = 'ALL';
  context.memoLoadCampaigns();
  getField('memoPull').value = '0';
  context.memoFillFromCampaign();
  return { context, getField };
}

test('Memo opens with its document preview before campaign data is loaded', () => {
  const fields = new Map();
  const getField = id => {
    if (!fields.has(id)) fields.set(id, { value: '', innerHTML: '' });
    return fields.get(id);
  };
  const context = {
    document: { getElementById: getField },
    google: { script: { run: {
      withSuccessHandler() {
        return {
          getMonthlySubmitSummary() {
            assert.match(getField('memoPaper').innerHTML, /INTERNAL MEMO/);
          }
        };
      }
    } } },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'memo.js' });
  context.memoRenderBlocks = () => {};
  context.memoRenderBtnRows = () => {};
  context.memoRenderStatus = () => {};
  context.memoLoadCampaigns = () => {};
  context.initMemo();
  const html = getField('memoPaper').innerHTML;
  assert.match(html, /บันทึกภายใน/);
  assert.match(html, /\(หัวข้อเรื่อง\)/);
  assert.match(html, /จากแผนก/);
  assert.doesNotMatch(html, /เริ่มพิมพ์ด้านซ้าย/);
});

test('Memo keeps each campaign button detail line as a separately numbered item', () => {
  const { getField } = loadMemo({
    campaign: 'ทดสอบ', opStatus: 'CONFIRMED',
    buttons: [
      { detail: '1. ข้อแรก\r\n2. ข้อสอง\n\n3) ข้อสาม' },
      { detail: '2. ข้อสอง\n4. ข้อสี่' },
    ],
  });
  assert.equal(getField('memoDetail').value, '1. ข้อแรก\n2. ข้อสอง\n3. ข้อสาม\n4. ข้อสี่');
  const html = getField('memoPaper').innerHTML;
  assert.match(html, /<ol class="mp-list"[^>]*><li>ข้อแรก<\/li><li>ข้อสอง<\/li><li>ข้อสาม<\/li><li>ข้อสี่<\/li><\/ol>/);
});

test('Memo numbers manually entered lines and campaign-level fallback details', () => {
  const { context, getField } = loadMemo({
    campaign: 'ทดสอบ', opStatus: 'CONFIRMED',
    detail: '1. รายการหนึ่ง\n2. รายการสอง', buttons: [{ detail: '' }],
  });
  assert.equal(getField('memoDetail').value, '1. รายการหนึ่ง\n2. รายการสอง');
  getField('memoDetail').value = '1. หนึ่ง\nสอง\n\n3) สาม';
  context.memoBuild();
  assert.match(getField('memoPaper').innerHTML, /<ol class="mp-list"[^>]*><li>หนึ่ง<\/li><li>สอง<\/li><li>สาม<\/li><\/ol>/);
});

test('Memo counts Enter-separated promotion details, not visual wrapping within a long line', () => {
  const lines = [
    'ลด 50% Mega kai wan & Fries + Mega CK +Mega FF + Cheesy sauce+ 16 Oz. Drink x 3 เพียง 264 บาท จากราคาปกติ 528 บาท',
    'ลด 44%Large FF  + Giga kai wan & Fries + Large CS + 16 Oz. Drink x 2 เพียง 219 บาท จากราคาปกติ 389 บาท',
    'BOGO Mega FF ราคา 105 บาท จากปกติ 190 บาท (ลูกค้าจ่าย 95 บาท)',
    '<โปรโมชัน> เซ็ตคอมโบซุปเปอร์เทร่า (COMBO SUPER TERA) เพียง 189 บาท จากราคาปกติ 224 บาท(ลูกค้าจ่ายที่ 159 บาท)',
    '(จากแคมเปญ 50 50)',
  ];
  const { getField } = loadMemo({
    campaign: 'ทดสอบ', opStatus: 'CONFIRMED',
    buttons: [{ detail: lines.join('\n') }],
  });
  assert.equal(getField('memoDetail').value, '1. ' + lines[0] + '\n2. ' + lines[1] + '\n3. ' + lines[2] + '\n4. ' + lines[3] + '\n' + lines[4]);
  const detail = getField('memoPaper').innerHTML.match(/<div class="mp-sect">รายละเอียดโปรโมชั่น<\/div><ol[^>]*>(.*?)<\/ol>/);
  assert.ok(detail, 'promotion detail list is present');
  assert.equal((detail[1].match(/<li>/g) || []).length, 4);
  assert.match(detail[1], /<li>&lt;โปรโมชัน&gt; เซ็ตคอมโบซุปเปอร์เทร่า.*<div class="mp-item-note">\(จากแคมเปญ 50 50\)<\/div><\/li>/);
});

test('Memo keeps numbered offers and attaches consecutive standalone notes to the last offer', () => {
  const { getField } = loadMemo({
    campaign: 'ทดสอบ', opStatus: 'CONFIRMED',
    buttons: [{ detail: '1. โปรแรก\n2. โปรสอง\n  (จากแคมเปญเดิม)\nหมายเหตุ: ใช้เฉพาะวันศุกร์' }],
  });
  const html = getField('memoPaper').innerHTML;
  assert.match(html, /<li>โปรแรก<\/li><li>โปรสอง<div class="mp-item-note">\(จากแคมเปญเดิม\)<\/div><div class="mp-item-note">หมายเหตุ: ใช้เฉพาะวันศุกร์<\/div><\/li>/);
  assert.equal((html.match(/<div class="mp-item-note">/g) || []).length, 2);
});

test('a promotional offer in parentheses is still a numbered item', () => {
  const { getField } = loadMemo({
    campaign: 'ทดสอบ', opStatus: 'CONFIRMED',
    buttons: [{ detail: '1. โปรแรก\n(ลด 50% ทุกเมนู)\n(จากแคมเปญ 50 50)' }],
  });
  const html = getField('memoPaper').innerHTML;
  assert.match(html, /<li>โปรแรก<\/li><li>\(ลด 50% ทุกเมนู\)<div class="mp-item-note">\(จากแคมเปญ 50 50\)<\/div><\/li>/);
});

test('Memo editor shows the next number inside the textarea when Enter is pressed', () => {
  const { context, getField } = loadMemo({ campaign: 'ทดสอบ', opStatus: 'CONFIRMED', buttons: [] });
  const field = getField('memoDetail');
  field.setSelectionRange = (start, end) => { field.selectionStart = start; field.selectionEnd = end; };
  context.memoDetailFocus(field);
  assert.equal(field.value, '1. ');
  assert.equal(field.selectionStart, 3);
  field.value = '1. โปรแรก\n';
  field.selectionStart = field.selectionEnd = field.value.length;
  context.memoDetailInput(field, { inputType: 'insertLineBreak' });
  assert.equal(field.value, '1. โปรแรก\n2. ');
  assert.equal(field.selectionStart, field.value.length);
  field.value += 'โปรสอง';
  context.memoDetailInput(field, { inputType: 'insertText' });
  assert.match(getField('memoPaper').innerHTML, /<li>โปรแรก<\/li><li>โปรสอง<\/li>/);
  field.value = '1. โปรแรก\n2. ';
  context.memoDetailBlur(field);
  assert.equal(field.value, '1. โปรแรก');
});

test('Memo editor renumbers pasted lines and does not count a standalone note', () => {
  const { context, getField } = loadMemo({ campaign: 'ทดสอบ', opStatus: 'CONFIRMED', buttons: [] });
  const field = getField('memoDetail');
  field.value = '7. โปรแรก\n(จากแคมเปญเดิม)\n9) โปรสอง';
  field.selectionStart = field.selectionEnd = field.value.length;
  context.memoDetailInput(field, { inputType: 'insertFromPaste' });
  assert.equal(field.value, '1. โปรแรก\n(จากแคมเปญเดิม)\n2. โปรสอง');
  assert.equal((getField('memoPaper').innerHTML.match(/<li>/g) || []).length >= 2, true);
  field.value = '1. โปรแรก\n(จากแคมเปญเดิม)\n2. โปรสอง';
  context.memoDetailBlur(field);
  assert.equal(field.value, '1. โปรแรก\n(จากแคมเปญเดิม)\n2. โปรสอง');
});

test('Memo editor leaves composition text untouched while typing Thai', () => {
  const { context, getField } = loadMemo({ campaign: 'ทดสอบ', opStatus: 'CONFIRMED', buttons: [] });
  const field = getField('memoDetail');
  field.value = '1. โปรแรก\nข้อความ';
  context.memoDetailInput(field, { inputType: 'insertCompositionText', isComposing: true });
  assert.equal(field.value, '1. โปรแรก\nข้อความ');
});

test('a real campaign detail with title and button type produces one numbered offer', () => {
  const campaign = 'Grab - โปรโมชันซื้อครบ 159 บาท ฟรี เป๊ปซี่ 16 ออนซ์';
  const { getField } = loadMemo({
    campaign, opStatus: 'CONFIRMED',
    buttons: [{ detail: campaign + '\n\nประเภทปุ่มโปรโมชั่น : Item Set\n\nซื้อครบ 159 รับฟรี เป๊ปซี่ 16 ออนซ์ เท่านั้น (ไม่สามารถเปลี่ยนเครื่องดื่มได้)' }],
  });
  assert.equal(getField('memoDetail').value, '1. ซื้อครบ 159 รับฟรี เป๊ปซี่ 16 ออนซ์ เท่านั้น (ไม่สามารถเปลี่ยนเครื่องดื่มได้)');
  assert.equal((getField('memoPaper').innerHTML.match(/<li>/g) || []).length >= 1, true);
  assert.match(getField('memoDetailSourceLines').innerHTML, /ประเภทปุ่มโปรโมชั่น : Item Set/);
});

test('Goodie shared detail is imported once and 1แถม1 joins its product offer', () => {
  const detail = [
    'ลด 50% Mega Churros + 2sauce + Mega FF + Mega CS + 16 oz. Drinkx 3 ราคา 263 บาท (จากราคาปกติ 525 บาท)',
    'ลด 35% 2 Handheld Churros +2 sauce + Jumbo FF + 16 oz. Drinkx 2 ราคา 229 บาท (จากราคาปกติ 353 บาท)',
    'ลด 36% Jumbo FF +Jumbo churros + Large Nugget+ 16 oz. Drink ราคา 199 บาท (จากราคาปกติ 313 บาท)',
    'ลด 24% Giga kai wan & Fries + 16 oz. Drink ราคา 159 บาท (จากราคาปกติ 209 บาท)',
    'ลด 28% Giga Squid Karaage & Fries + Mega Churros + 2sauce ราคา 239 บาท (จากราคาปกติ 330 บาท)',
    '1แถม1',
    'Mega Churros + 2sauce ฟรี Handheld Churros ราคา 165 บาท (จากราคาปกติ 234 บาท)',
  ].join('\n');
  const { getField } = loadMemo({
    campaign: 'Lineman - Goodie อร่อยทุกคำ (Oct 26)', opStatus: 'CONFIRMED',
    buttons: Array.from({ length: 6 }, () => ({ detail })),
  });
  const value = getField('memoDetail').value;
  assert.equal(value.split('\n').length, 6);
  assert.match(value, /6\. 1แถม1 — Mega Churros/);
  assert.equal((value.match(/ลด 50%/g) || []).length, 1);
});

test('Robinhood button names and contextual rows stay in the review panel, not the numbered list', () => {
  const detail = 'ลด 37% Mega Churros ราคา 249 บาท\nลด 32% Mega FF ราคา 199 บาท\nลด 36% Large kai wan ราคา 149 บาท\n\nRBH-ฟินยกเซต1[249]\nRBH-ฟินยกเซต2[199]\nRBH-ฟินยกเซต3[149]';
  const { getField } = loadMemo({ campaign: 'Robinhood - ฟินยกเซต (Oct 26)', opStatus: 'CONFIRMED', buttons: Array.from({ length: 3 }, () => ({ detail })) });
  assert.equal(getField('memoDetail').value.split('\n').length, 3);
  assert.doesNotMatch(getField('memoDetail').value, /RBH-ฟินยกเซต/);
  assert.match(getField('memoDetailSourceLines').innerHTML, /RBH-ฟินยกเซต3\[149\]/);
});

test('ambiguous imported text stays available for review without fabricating a numbered offer', () => {
  const { context, getField } = loadMemo({ campaign: 'ทดสอบ', opStatus: 'CONFIRMED', buttons: [{ detail: 'ทดสอบ\nประเภทปุ่มโปรโมชั่น : Item discount\nลูกค้าบวกเพิ่ม 29 บาท อัพไซซ์เมนู' }] });
  assert.equal(getField('memoDetail').value, '');
  assert.match(getField('memoDetailSourceLines').innerHTML, /ลูกค้าบวกเพิ่ม 29 บาท/);
  context.memoAddSourceDetail(2);
  assert.equal(getField('memoDetail').value, '1. ลูกค้าบวกเพิ่ม 29 บาท อัพไซซ์เมนู');
});
