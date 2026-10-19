const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'cloud-store.js'), 'utf8');
const data = new Map();
let localWrites = 0;
const localStorage = {
  getItem(key) { return data.has(key) ? data.get(key) : null; },
  setItem(key, value) { localWrites++; data.set(key, String(value)); },
  removeItem(key) { data.delete(key); },
  key(index) { return [...data.keys()][index] || null; },
  get length() { return data.size; },
};
let mode = 'success';
let campaignBlock = null;
const submitted = { submissionId: 'submit-test-001', actor: 'MKT', expectedButtons: 1, writes: [] };
const receipt = { ok: true, submissionId: submitted.submissionId, savedButtons: 1, savedAt: 123, versions: {} };
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300, status, headers: { get() { return null; } },
  async json() { return body; },
});
async function fetchMock(url, options = {}) {
  const route = new URL(url).pathname;
  if (route === '/promo/store') return response({ ok: true, keys: { 'promo::meta': '{}' }, meta: { 'promo::meta': 1 } });
  if (route.startsWith('/promo/store/')) {
    return campaignBlock ? response({ ok: true, value: JSON.stringify(campaignBlock), updated_at: 5 }) : response({ ok: false }, 404);
  }
  if (route === '/promo/submissions' && options.method === 'POST') {
    if (mode === 'lost-response' || mode === 'unknown') throw new Error('network lost');
    return response(receipt);
  }
  if (route === '/promo/submissions/submit-test-001') {
    return mode === 'unknown' ? response({ ok: false }, 404) : response(receipt);
  }
  throw new Error(`Unexpected route: ${route}`);
}
const sandbox = {
  localStorage, fetch: fetchMock, URL, Date, Math,
  console: { log() {}, warn() {}, error() {} },
  navigator: { onLine: true },
  setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; },
  document: { readyState: 'loading', hidden: false, addEventListener() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
};
sandbox.window = sandbox;
sandbox.addEventListener = () => {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

(async () => {
  await sandbox.PC_CLOUD.pull();
  const writesAfterHydration = localWrites;
  const row = { month: '2026-10', campaign: 'Campaign A', shortName: 'Button A', itemCode: '101001', submissionId: submitted.submissionId };
  const prepared = await sandbox.PC_CLOUD.prepareCampaignWrites([row], submitted.submissionId);
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].expectedUpdatedAt, null);
  assert.equal(JSON.parse(prepared[0].value).m['2026-10'][0].itemCode, '101001');
  assert.equal(localWrites, writesAfterHydration, 'preparing a campaign must not write browser storage');
  const batchRow = { ...row, submissionId: 'campaign-receipt-001', submissionBatchId: 'batch-test-001' };
  assert.equal((await sandbox.PC_CLOUD.prepareCampaignWrites([batchRow], 'batch-test-001')).length, 1);
  assert.equal((await sandbox.PC_CLOUD.commitSubmission(submitted)).savedButtons, 1);
  assert.equal(localWrites, writesAfterHydration, 'Cloud-first commit must not write browser storage before Cloud acknowledgment');
  mode = 'lost-response';
  assert.equal((await sandbox.PC_CLOUD.commitSubmission(submitted)).submissionId, submitted.submissionId);
  assert.equal(localWrites, writesAfterHydration);
  mode = 'unknown';
  await assert.rejects(() => sandbox.PC_CLOUD.commitSubmission(submitted), error => error.code === 'CLOUD_OUTCOME_UNKNOWN');
  assert.equal(localWrites, writesAfterHydration);
  campaignBlock = JSON.parse(prepared[0].value);
  await assert.rejects(() => sandbox.PC_CLOUD.prepareCampaignWrites([row], submitted.submissionId), /มีอยู่ในแคมเปญ/);
  console.log('Cloud-first client contract: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
