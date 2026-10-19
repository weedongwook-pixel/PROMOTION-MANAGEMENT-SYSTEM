const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../Potato Corner Promotion System.html'), 'utf8');

function permissions(initial = {}) {
  const storage = new Map(Object.entries(initial));
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  const start = html.indexOf('function ensureITWork(perms)');
  const end = html.indexOf('window.PC_getPermissions = getPermissions;', start);
  assert.ok(start >= 0 && end > start, 'permission functions must be present');
  const context = { localStorage, window: {} };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end + 'window.PC_getPermissions = getPermissions;'.length), context);
  return { get: context.window.PC_getPermissions, storage };
}

test('submission log menu follows Create Promotion directly', () => {
  const create = html.indexOf('id="nav-CreatePromotion"');
  const log = html.indexOf('id="nav-SubmissionLog"');
  const next = html.indexOf('id="nav-Proposal"');
  assert.ok(create >= 0 && create < log && log < next);
  assert.equal((html.match(/id="nav-SubmissionLog"/g) || []).length, 1);
});

test('submission history names the purpose and makes the active viewer scope visible', () => {
  const page = fs.readFileSync(path.join(__dirname, '../pages/SubmissionLog.html'), 'utf8');
  assert.match(html, /data-th="ประวัติการแจ้งโปรฯ"/);
  assert.match(page, /<h1>[^<]*<i[^>]*><\/i>ประวัติการแจ้งโปรโมชั่น<\/h1>/);
  assert.match(page, /id="sl-active-scope"/);
  assert.match(page, /เฉพาะรายการของฉัน/);
  assert.match(page, /ทุกผู้ส่ง/);
});

test('new roles grant the log to MKT, RD, and IT but not OP', () => {
  const { get } = permissions();
  const access = get();
  assert.ok(access.MKT.includes('SubmissionLog'));
  assert.ok(access.IT.includes('SubmissionLog'));
  assert.ok(access.RD.includes('SubmissionLog'));
  assert.ok(!access.OP.includes('SubmissionLog'));
});

test('existing IT and MKT roles receive a scoped one-time log grant', () => {
  const existing = { Admin: ['Dashboard'], MKT: ['Dashboard'], IT: ['Dashboard'], OP: ['Dashboard'] };
  const { get, storage } = permissions({
    pc_permissions: JSON.stringify(existing),
    pc_perm_backfill_ver: '17',
    pc_perm_mig_itonly_v1: '1',
    pc_perm_mig_staffdisc_removed: '1',
  });
  const access = get();
  assert.ok(access.IT.includes('SubmissionLog'));
  assert.ok(access.MKT.includes('SubmissionLog'));
  assert.deepEqual(Array.from(access.OP), ['Dashboard']);
  assert.equal(storage.get('pc_perm_backfill_ver'), '17', 'unrelated permissions should not be backfilled');
  assert.equal(storage.get('pc_perm_submission_log_it_mkt_v1'), '1');
  const count = access.IT.length;
  get();
  assert.equal(get().IT.length, count, 'grant must not duplicate the page');
});

test('admin can revoke the IT log permission after the one-time grant', () => {
  const { get } = permissions({
    pc_permissions: JSON.stringify({ Admin: ['Dashboard'], MKT: ['Dashboard'], IT: ['Dashboard'], OP: ['Dashboard'] }),
    pc_perm_backfill_ver: '17',
    pc_perm_mig_itonly_v1: '1',
    pc_perm_mig_staffdisc_removed: '1',
    pc_perm_submission_log_it_mkt_v1: '1',
  });
  assert.ok(!get().IT.includes('SubmissionLog'));
});

test('existing RD account receives only the log permission', () => {
  const existing = { Admin: ['Dashboard'], MKT: ['Dashboard'], IT: ['Dashboard'], RD: ['Dashboard'], OP: ['Dashboard'] };
  const { get, storage } = permissions({
    pc_permissions: JSON.stringify(existing),
    pc_perm_backfill_ver: '17',
    pc_perm_mig_itonly_v1: '1',
    pc_perm_mig_staffdisc_removed: '1',
    pc_perm_submission_log_it_mkt_v1: '1',
  });
  assert.deepEqual(Array.from(get().RD), ['Dashboard', 'SubmissionLog']);
  assert.equal(storage.get('pc_perm_submission_log_rd_v1'), '1');
});
