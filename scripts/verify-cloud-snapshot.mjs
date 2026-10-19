// Read-only baseline check for a Wrangler D1 SQL export. Nothing is written to
// the source export or to Cloud. Usage:
//   node scripts/verify-cloud-snapshot.mjs backup.sql [new-backup.sql]
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function loadSnapshot(filename) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(filename, 'utf8'));
    const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (integrity !== 'ok') throw new Error(`SQLite integrity failed: ${integrity}`);
    const rows = db.prepare('SELECT k,v,updated_at FROM promo_store ORDER BY k').all();
    const historyRows = db.prepare('SELECT count(*) AS n FROM promo_store_history').get().n;
    const keys = new Map(rows.map(row => [row.k, row]));
    const parse = key => {
      const item = keys.get(key);
      if (!item) return null;
      try { return JSON.parse(item.v); }
      catch { throw new Error(`Invalid JSON in ${key}`); }
    };
    let campaignKeys = 0, itemRows = 0, workingRows = 0, campaignShapeErrors = 0;
    const buttonIds = new Set();
    for (const row of rows) {
      if (!row.k.startsWith('promo::c::')) continue;
      campaignKeys++;
      const block = parse(row.k);
      if (!block || !block.m || typeof block.m !== 'object' || !Array.isArray(block.w)) {
        campaignShapeErrors++;
        continue;
      }
      workingRows += block.w.length;
      for (const [month, items] of Object.entries(block.m)) {
        if (!Array.isArray(items)) { campaignShapeErrors++; continue; }
        itemRows += items.length;
        for (const item of items) {
          if (item && item.campaign && item.shortName) buttonIds.add(`${item.campaign}\u0000${month}\u0000${item.shortName}`);
        }
      }
    }
    const meta = parse('promo::meta') || {};
    const codeLedger = parse('pc_code_counter_v1') || {};
    const files = parse('pc_promo_files') || {};
    const contentDigest = sha256(rows.map(row => `${row.k}\u0000${sha256(row.v)}\n`).join(''));
    return {
      filename,
      summary: {
        integrity,
        keys: rows.length,
        historyRows,
        campaignKeys,
        itemRows,
        workingRows,
        distinctButtons: buttonIds.size,
        campaignShapeErrors,
        npdJobs: Array.isArray(meta.npd) ? meta.npd.length : null,
        flavorJobs: Array.isArray(meta.flavor) ? meta.flavor.length : null,
        npdProducts: Array.isArray(meta.npdProducts) ? meta.npdProducts.length : null,
        codeReservations: codeLedger.reservations && typeof codeLedger.reservations === 'object'
          ? Object.keys(codeLedger.reservations).length : null,
        attachments: files && typeof files === 'object' ? Object.keys(files).length : null,
        contentDigest,
      },
      hashes: new Map(rows.map(row => [row.k, sha256(row.v)])),
    };
  } finally { db.close(); }
}

if (process.argv.length < 3 || process.argv.length > 4) {
  console.error('Usage: node scripts/verify-cloud-snapshot.mjs backup.sql [new-backup.sql]');
  process.exitCode = 2;
} else {
  const baseline = loadSnapshot(process.argv[2]);
  console.log(JSON.stringify(baseline.summary, null, 2));
  if (process.argv[3]) {
    const current = loadSnapshot(process.argv[3]);
    const allKeys = new Set([...baseline.hashes.keys(), ...current.hashes.keys()]);
    const changed = [...allKeys].filter(key => baseline.hashes.get(key) !== current.hashes.get(key));
    console.log(JSON.stringify({
      comparison: {
        before: baseline.filename,
        after: current.filename,
        changedKeyCount: changed.length,
        addedKeys: changed.filter(key => !baseline.hashes.has(key)),
        removedKeys: changed.filter(key => !current.hashes.has(key)),
        modifiedKeys: changed.filter(key => baseline.hashes.has(key) && current.hashes.has(key)),
        current: current.summary,
      },
    }, null, 2));
  }
}
