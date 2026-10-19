const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

class TestD1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('CREATE TABLE promo_store (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    const migrations = path.join(__dirname, '..', 'sync-worker', 'migrations');
    this.db.exec(fs.readFileSync(path.join(migrations, '001_history.sql'), 'utf8'));
    this.db.exec(fs.readFileSync(path.join(migrations, '002_submission_receipts.sql'), 'utf8'));
  }
  prepare(sql) {
    const statement = this.db.prepare(sql);
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return statement.get(...values) || null; },
      async all() { return { results: statement.all(...values) }; },
      async run() {
        const result = statement.run(...values);
        return { meta: { changes: Number(result.changes) } };
      },
    };
  }
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  row(key) { return this.db.prepare('SELECT * FROM promo_store WHERE k=?').get(key); }
  receipt(id) { return this.db.prepare('SELECT * FROM promo_submission_receipts WHERE submission_id=?').get(id); }
}

function campaignValue(campaign, submissionId, shortName, itemCode, batchId = '') {
  const month = '2026-10';
  const row = { campaign, shortName, itemCode, submissionId, submissionBatchId: batchId, month };
  return JSON.stringify({ w: [row], m: { [month]: [row] } });
}

(async () => {
  const source = require('./helpers/sync-worker-source.cjs')();
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default;
  const env = { DB: new TestD1(), SYNC_TOKEN: 'test-token', CLOUD_FIRST_ENABLED: 'true' };
  const call = async (method, route, body, authenticated = true) => {
    const response = await worker.fetch(new Request(`https://example.com${route}`, {
      method,
      headers: authenticated ? { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' } : {},
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    return { status: response.status, body: await response.json() };
  };
  const keyA = 'promo::c::Campaign%20A';
  const keyB = 'promo::c::Campaign%20B';
  const id1 = 'submission-test-001';
  const firstBody = {
    submissionId: id1, actor: 'MKT User', expectedButtons: 1,
    writes: [{ key: keyA, value: campaignValue('Campaign A', id1, 'Button A', '101001'), expectedUpdatedAt: null }],
  };
  env.CLOUD_FIRST_ENABLED = 'false';
  assert.equal((await call('POST', '/promo/submissions', firstBody)).status, 404);
  env.CLOUD_FIRST_ENABLED = 'true';
  assert.equal((await call('POST', '/promo/submissions', firstBody, false)).status, 401);
  assert.equal((await call('POST', '/promo/submissions', { ...firstBody, expectedButtons: 2 })).body.error, 'button_count_mismatch');
  assert.equal((await call('POST', '/promo/submissions', { ...firstBody, writes: [{ ...firstBody.writes[0], key: 'pc_mock_store_v28' }] })).status, 400);
  const first = await call('POST', '/promo/submissions', firstBody);
  assert.equal(first.status, 200);
  assert.equal(first.body.savedButtons, 1);
  assert.equal(env.DB.row(keyA).v, firstBody.writes[0].value);
  assert.ok(env.DB.receipt(id1));
  const replay = await call('POST', '/promo/submissions', firstBody);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.versions[keyA], first.body.versions[keyA]);
  assert.equal((await call('GET', `/promo/submissions/${id1}`)).body.savedButtons, 1);
  assert.equal((await call('POST', '/promo/submissions', { ...firstBody, actor: 'Other User' })).body.error, 'submission_id_reused');

  const staleId = 'submission-test-002';
  const staleBody = {
    submissionId: staleId, actor: 'MKT User', expectedButtons: 2,
    writes: [
      { key: 'pc_code_counter_v1', value: JSON.stringify({ reservations: { 'IC9999': 'RESERVED' } }), expectedUpdatedAt: null },
      { key: keyB, value: campaignValue('Campaign B', staleId, 'Button B', '101002'), expectedUpdatedAt: null },
      { key: keyA, value: campaignValue('Campaign A', staleId, 'Button C', '101003'), expectedUpdatedAt: null },
    ],
  };
  const stale = await call('POST', '/promo/submissions', staleBody);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'version_conflict');
  assert.equal(env.DB.row(keyB), undefined, 'first write in failed batch must roll back');
  assert.equal(env.DB.row('pc_code_counter_v1'), undefined, 'code reservation in failed batch must roll back');
  assert.equal(env.DB.receipt(staleId), undefined, 'failed batch must not create receipt');
  assert.equal(env.DB.row(keyA).v, firstBody.writes[0].value);

  const id3 = 'submission-test-003';
  const nextValue = JSON.parse(firstBody.writes[0].value);
  nextValue.w.push({ campaign: 'Campaign A', shortName: 'Button D', submissionId: id3 });
  nextValue.m['2026-10'].push({ campaign: 'Campaign A', shortName: 'Button D', itemCode: '101004', submissionId: id3 });
  const next = await call('POST', '/promo/submissions', {
    submissionId: id3, actor: 'MKT User', expectedButtons: 1,
    writes: [{ key: keyA, value: JSON.stringify(nextValue), expectedUpdatedAt: first.body.versions[keyA] }],
  });
  assert.equal(next.status, 200);
  assert.ok(next.body.versions[keyA] > first.body.versions[keyA]);
  assert.equal(JSON.parse(env.DB.row(keyA).v).m['2026-10'].length, 2);

  const batchId = 'submission-batch-004';
  const otherKey = 'promo::c::Campaign%20B';
  const batch = await call('POST', '/promo/submissions', {
    submissionId: batchId, actor: 'MKT User', expectedButtons: 1,
    writes: [{ key: otherKey, value: campaignValue('Campaign B', 'campaign-receipt-004', 'Button E', '101005', batchId), expectedUpdatedAt: null }],
  });
  assert.equal(batch.status, 200);
  assert.equal(batch.body.savedButtons, 1);
  console.log('Sync Worker Cloud-first submission transaction: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
