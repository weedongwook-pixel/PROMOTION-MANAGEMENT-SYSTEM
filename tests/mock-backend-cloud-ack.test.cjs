const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const data = new Map([['pc_mock_store_v28', JSON.stringify({
  months: { '2026-09': [] }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
})]]);
const localStorage = {
  getItem: key => data.has(key) ? data.get(key) : null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: key => data.delete(key),
  key: index => [...data.keys()][index] || null,
  get length() { return data.size; },
};
const sandbox = {
  localStorage, URL, Date, Math,
  console: { log() {}, warn() {}, error() {} },
  setTimeout() {}, clearTimeout() {},
  location: { hostname: 'white-pine-853e.quiet-surf-dda2.workers.dev', href: 'https://white-pine-853e.quiet-surf-dda2.workers.dev/' },
};
sandbox.window = sandbox;
sandbox.PC_REAL_PROMOS = [];
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'mock-backend.js'), 'utf8'), sandbox);

(async () => {
  // The bridge must not claim success while the Cloud acknowledgment is pending.
  let release;
  const acknowledgment = new Promise(resolve => { release = resolve; });
  sandbox.PC_CLOUD = { enabled: () => true, hasPending: () => true, syncNow: () => acknowledgment };
  sandbox.PC_API.__saveProbe = () => 'SUCCESS';
  sandbox.setTimeout = callback => { queueMicrotask(callback); return 1; };

  // Opening Memo only reads a static page and local campaign summaries. It
  // must work even if an unrelated pending Cloud write cannot be synced.
  sandbox.PC_API.getPageContent = () => Promise.resolve('<main>MEMO</main>');
  sandbox.PC_API.getMonthlySubmitSummary = () => [];
  sandbox.PC_API.getMemoCampaigns = () => [{ campaign: 'MEMO' }];
  const read = name => new Promise((resolve, reject) => {
    sandbox.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[name]();
  });
  sandbox.PC_CLOUD.syncNow = () => Promise.reject(new Error('Unrelated pending sync failed'));
  assert.equal(await read('getPageContent'), '<main>MEMO</main>');
  assert.deepEqual(Array.from(await read('getMonthlySubmitSummary')), []);
  assert.equal((await read('getMemoCampaigns'))[0].campaign, 'MEMO');
  sandbox.PC_CLOUD = undefined;
  assert.equal(await read('getPageContent'), '<main>MEMO</main>', 'a static page does not need the Cloud adapter');
  sandbox.PC_CLOUD = { enabled: () => true, hasPending: () => true, syncNow: () => acknowledgment };

  let success = false;
  sandbox.google.script.run.withSuccessHandler(() => { success = true; }).__saveProbe();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(success, false);
  release(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(success, true);

  // An action is shown as completed only after the campaign save and its
  // separate Cloud audit record have both been acknowledged.
  let releaseAudit;
  const auditAck = new Promise(resolve => { releaseAudit = resolve; });
  sandbox.PC_SubmissionLog = { createActivity: activity => ({ id: 'ACT-1', date: '2026-10-02', ...activity }) };
  sandbox.PC_CLOUD.syncNow = () => Promise.resolve(true);
  sandbox.PC_CLOUD.appendActivity = () => auditAck;
  sandbox.PC_API.__activityProbe = () => ({ status: 'success', message: 'saved', _activity: { kind: 'ADDED', campaign: 'Goodie' } });
  success = false;
  sandbox.google.script.run.withSuccessHandler(() => { success = true; }).__activityProbe();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(success, false);
  releaseAudit(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(success, true);

  sandbox.PC_CLOUD.appendActivity = () => Promise.reject(new Error('Audit offline'));
  let partialResult;
  sandbox.google.script.run.withSuccessHandler(value => { partialResult = value; }).__activityProbe();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(partialResult.status, 'success', 'the campaign must not be falsely reported as unsaved');
  assert.match(partialResult._activityWarning, /Audit offline/);
  assert.match(partialResult.message, /ประวัติไม่ได้/);

  // A rejected Cloud write must go to the failure handler, never success.
  sandbox.PC_CLOUD.syncNow = () => Promise.reject(new Error('Cloud rejected'));
  let failed = false;
  success = false;
  sandbox.google.script.run.withSuccessHandler(() => { success = true; })
    .withFailureHandler(() => { failed = true; }).__saveProbe();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(success, false);
  assert.equal(failed, true);

  // A localStorage quota failure must also prevent a success callback, even
  // when the API method accidentally returns SUCCESS.
  sandbox.PC_API.__failProbe = () => { sandbox.__PC_PERSIST_FAIL = { at: 'now' }; return 'SUCCESS'; };
  failed = false;
  success = false;
  sandbox.google.script.run.withSuccessHandler(() => { success = true; })
    .withFailureHandler(() => { failed = true; }).__failProbe();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(success, false);
  assert.equal(failed, true);
  console.log('Mock backend Cloud acknowledgment: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
