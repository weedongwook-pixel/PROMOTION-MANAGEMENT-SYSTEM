import { WorkflowEntrypoint } from 'cloudflare:workers';

const EXPORT_RETRIES = {
  retries: { limit: 12, delay: '30 seconds', backoff: 'constant' },
  timeout: '5 minutes',
};

function exportUrl(env) {
  return `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${env.DATABASE_ID}/export`;
}

async function requestExport(env, payload) {
  if (!env.D1_REST_API_TOKEN) throw new Error('D1_REST_API_TOKEN is not configured');
  const response = await fetch(exportUrl(env), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.D1_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`D1 export request failed (HTTP ${response.status})`);
  const data = await response.json();
  if (!data.success || !data.result) throw new Error('D1 export request returned no result');
  return data.result;
}

export class DailyD1BackupWorkflow extends WorkflowEntrypoint {
  async run(_event, step) {
    const exportJob = await step.do('Start D1 SQL export', EXPORT_RETRIES, async () => {
      const result = await requestExport(this.env, { output_format: 'polling' });
      if (!result.at_bookmark || typeof result.at_bookmark !== 'string') {
        throw new Error('D1 export returned no bookmark');
      }
      const startedAt = new Date().toISOString();
      const day = startedAt.slice(0, 10);
      const safeBookmark = result.at_bookmark.replace(/[^a-zA-Z0-9-]/g, '');
      return {
        bookmark: result.at_bookmark,
        key: `potato-promo/${day}/${startedAt}-${safeBookmark}.sql`,
        startedAt,
      };
    });

    const saved = await step.do('Download and verify SQL backup in R2', EXPORT_RETRIES, async () => {
      const result = await requestExport(this.env, { current_bookmark: exportJob.bookmark });
      if (!result.signed_url) throw new Error('D1 export is not ready yet');

      // Never log the signed URL or the SQL dump; both contain sensitive data.
      const dump = await fetch(result.signed_url);
      if (!dump.ok || !dump.body) throw new Error(`D1 dump download failed (HTTP ${dump.status})`);

      const object = await this.env.BACKUP_BUCKET.put(exportJob.key, dump.body, {
        httpMetadata: { contentType: 'application/sql' },
        customMetadata: {
          databaseId: this.env.DATABASE_ID,
          bookmark: exportJob.bookmark,
          startedAt: exportJob.startedAt,
        },
      });
      const stored = await this.env.BACKUP_BUCKET.head(exportJob.key);
      if (!object || !stored || stored.size < 1 || stored.size !== object.size) {
        throw new Error('R2 backup verification failed');
      }
      return { key: exportJob.key, size: stored.size };
    });

    console.log(`D1 backup saved and verified: ${saved.key} (${saved.size} bytes)`);
    return saved;
  }
}

// No public endpoint can trigger a backup or download stored data.
export default {
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
