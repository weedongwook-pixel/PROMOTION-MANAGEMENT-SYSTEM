const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../pages/SubmissionLog.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
assert.match(html, /<th>จำนวนปุ่มโปรฯ<\/th>/);
assert.match(html, /“งานถูกลบ” คือมีประวัติการลบ/);
assert.doesNotMatch(html, /“บันทึกไม่สำเร็จ” จะแสดงเฉพาะงานที่เคยยืนยันสำเร็จ/);
assert.doesNotMatch(html, /ประวัติการส่งไม่สำเร็จแสดงเฉพาะเครื่องที่ส่ง|หากชื่อซ้ำกัน/);

test('submission history shows only Cloud-confirmed success and failure statuses', async () => {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', hidden: false, innerHTML: '', textContent: '', className: '', disabled: false,
      addEventListener() {}, setAttribute(name, value) { this[name] = value; }, getAttribute(name) { return this[name]; },
    });
    return elements.get(id);
  }
  const filterButtons = ['all', 'verified', 'failed'].map(value => {
    const button = element('button-' + value);
    button['data-filter'] = value;
    return button;
  });
  const rows = [
    { id: 'SUB-1', campaign: 'Goodie', status: 'verified', foundButtons: 0, expectedButtons: 2, trackingMismatch: true, at: '2026-10-02T10:00:00Z', user: 'Bow', form: 'Promotion' },
    { id: 'SUB-2', campaign: 'Churro', status: 'failed', foundButtons: 0, expectedButtons: 2, at: '2026-10-02T09:00:00Z', user: 'Bow', form: 'Promotion' },
  ];
  const log = {
    canViewAll: () => false, user: () => 'Bow', today: () => '2026-10-02', list: async () => rows,
    listActivity: async () => [
      { id: 'ACT-1', campaign: 'Goodie', kind: 'EXTENDED', scope: 'buttons', buttons: ['Deal 1'], before: '2026-10-10', after: '2026-10-20', at: '2026-10-02T11:00:00Z', user: 'Bow' },
      { id: 'ACT-2', campaign: 'Churro', kind: 'CANCELLED', scope: 'campaign', at: '2026-10-02T12:00:00Z', user: 'Bow' },
    ],
    summarize(items) {
      return { campaigns: new Set(items.filter(x => x.status === 'verified').map(x => x.campaign)).size, submissions: items.length,
        verified: items.filter(x => x.status === 'verified').length,
        failed: items.filter(x => x.status === 'failed').length, legacy: 0 };
    },
  };
  const context = {
    setTimeout, clearTimeout,
    window: { PC_SubmissionLog: log }, PC_SubmissionLog: log,
    document: {
      getElementById: element,
      querySelectorAll: () => filterButtons,
    },
  };
  vm.createContext(context);
  vm.runInContext(script, context);
  context.window.initSubmissionLog();
  await context.window.slRefresh();
  context.window.slSwitchTab('mail');
  assert.equal(element('sl-panel-history').hidden,true);
  assert.equal(element('sl-panel-mail').hidden,false);
  assert.equal(element('sl-tab-mail')['aria-selected'],'true');
  context.window.slSwitchTab('history');
  assert.equal(element('sl-panel-mail').hidden,true);
  assert.equal(element('sl-history-controls').hidden,false);
  assert.match(element('sl-overview').innerHTML, /บันทึกสำเร็จ 1 รายการ/);
  assert.match(element('sl-overview').innerHTML, /บันทึกไม่สำเร็จ 1/);
  assert.doesNotMatch(element('sl-overview').innerHTML, /ยังไม่มีแคมเปญที่บันทึกสำเร็จ/);
  assert.match(element('sl-metrics').innerHTML, /<strong>1<\/strong> แคมเปญที่บันทึกสำเร็จ/);
  assert.match(element('sl-rows').innerHTML, /Goodie[\s\S]*บันทึกสำเร็จ[\s\S]*ศูนย์ติดตามยังไม่ตรงกับ Cloud · ไม่ต้องส่งซ้ำ/, 'Tracking can lag behind a successful Cloud save');
  rows[0].foundButtons = 2;
  rows[0].trackingMismatch = false;
  context.window.slApplyFilters();
  assert.doesNotMatch(element('sl-rows').innerHTML, /พบครบ/, 'complete counts need no extra caption');
  assert.match(element('sl-metrics').innerHTML, /<strong>1<\/strong> บันทึกไม่สำเร็จ/);
  assert.equal(element('sl-count-all').textContent, 2);
  assert.equal(element('sl-count-verified').textContent, 1);
  assert.equal(element('sl-count-failed').textContent, 1);
  assert.equal(element('sl-list-tools').hidden, false);
  assert.equal(element('sl-activity-count').textContent, 2);
  assert.match(element('sl-activity-rows').innerHTML, /ขยายเวลา/);
  assert.match(element('sl-activity-rows').innerHTML, /ยกเลิก/);
  assert.match(element('sl-activity-rows').innerHTML, /พบใน Cloud/);
  assert.doesNotMatch(element('sl-activity-rows').innerHTML, /ACT-1|ACT-2/, 'internal event IDs stay hidden');
  assert.equal(element('sl-count-all').textContent, 2); // activity is not a new submission
  element('sl-activity-filter').value = 'CANCELLED';
  context.window.slRenderActivity();
  assert.doesNotMatch(element('sl-activity-rows').innerHTML, /Goodie/);
  assert.match(element('sl-activity-rows').innerHTML, /Churro/);
  assert.ok(element('sl-rows').innerHTML.indexOf('Churro') < element('sl-rows').innerHTML.indexOf('Goodie'));
  assert.doesNotMatch(element('sl-rows').innerHTML, /SUB-1|SUB-2/, 'internal submission IDs stay hidden');

  element('sl-search').value = 'Churro';
  context.window.slApplyFilters();
  assert.equal(element('sl-result-count').textContent, 'แสดง 1 จาก 2 รายการ');
  assert.match(element('sl-rows').innerHTML, /Churro/);
  assert.doesNotMatch(element('sl-rows').innerHTML, /Goodie/);

  context.window.slSetFilter('verified');
  assert.equal(element('sl-result-count').textContent, 'แสดง 0 จาก 2 รายการ');
  assert.match(element('sl-rows').innerHTML, /ไม่พบรายการที่ตรงกับคำค้นหาหรือตัวกรอง/);

  element('sl-search').value = '';
  context.window.slSetFilter('failed');
  assert.equal(element('sl-result-count').textContent, 'แสดง 1 จาก 2 รายการ');
  assert.match(element('sl-rows').innerHTML, /บันทึกไม่สำเร็จ/);
  assert.doesNotMatch(element('sl-rows').innerHTML, /ยังตรวจ Cloud ไม่ได้/);

  context.window.slClearFilters();
  assert.equal(element('sl-search').value, '');
  assert.equal(element('sl-result-count').textContent, 'แสดง 2 จาก 2 รายการ');

  log.list = async () => [rows[0],
    { campaign: 'Partial', status: 'needs_check', cloudPartial: true, error: 'พบข้อมูลบางส่วนใน Cloud แต่ปุ่มยังไม่ครบ กรุณาแจ้ง IT ก่อนส่งซ้ำ', at: '2026-10-02T08:00:00Z', user: 'Bow' },
    { campaign: 'Unknown', status: 'needs_check', at: '2026-10-02T07:00:00Z', user: 'Bow' }];
  await context.window.slRefresh();
  assert.match(element('sl-overview').innerHTML, /บันทึกสำเร็จ 1 รายการ/);
  assert.match(element('sl-overview').innerHTML, /ยังตรวจสอบไม่ได้ 2 รายการ/);
  assert.match(element('sl-rows').innerHTML, /Partial/);
  assert.match(element('sl-rows').innerHTML, /พบข้อมูลบางส่วนใน Cloud/);
  assert.match(element('sl-rows').innerHTML, /Goodie/);
  assert.doesNotMatch(element('sl-rows').innerHTML, /บันทึกไม่สำเร็จ/, 'an unresolved result must not be mislabelled');
  assert.match(element('sl-rows').innerHTML,/Unknown/);
  log.list=async()=>[{campaign:'Deleted job',status:'deleted',error:'งานถูกลบ โดย IT',at:'2026-10-02T08:00:00Z'}];
  await context.window.slRefresh();
  assert.match(element('sl-overview').innerHTML,/งานถูกลบ 1 รายการ/);
  assert.doesNotMatch(element('sl-overview').innerHTML,/บันทึกไม่สำเร็จ/);
  assert.match(element('sl-rows').innerHTML,/งานถูกลบ โดย IT/);
  assert.doesNotMatch(element('sl-rows').innerHTML,/เปิดศูนย์ติดตาม/);
});
