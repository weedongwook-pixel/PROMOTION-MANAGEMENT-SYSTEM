# Daily D1 backup

This Worker exports the entire production `potato-promo` D1 database as SQL at
00:00 Asia/Bangkok each day and writes a uniquely named object to a private R2
bucket. It never restores or updates D1. The Workflow checks that the R2 object
exists and has a nonzero size before reporting success. Failed exports retry and
remain visible as failed Workflow instances in Cloudflare.

## Prerequisites before activation

1. Enable R2 in the Cloudflare account. R2 is not enabled as of 2026-09-30;
   activation may require billing setup. Do not assume backups are active until
   the first R2 object has been verified.
2. Create a private bucket named `potato-promo-d1-backups`. Do not enable public
   bucket access or expose the SQL dumps through the website Worker.
3. Create a Cloudflare API token scoped to the production account and D1 database,
   with the minimum permission needed to export D1. Save it as the Worker secret
   `D1_REST_API_TOKEN`; never put its value into this repository.
4. From this directory, run `npx wrangler secret put D1_REST_API_TOKEN` and
   `npx wrangler deploy` with the approved Cloudflare account selected.
5. Trigger one backup instance, verify the Workflow completed and check the SQL
   object in R2. Periodically test restoring into a *separate* D1 database.

Do not restore a full backup directly onto production: it would overwrite newer
work. Inspect and selectively recover records instead. Set a retention policy
only after agreeing how long backups should be kept; this Worker does not delete
older backups. Monitor failed Workflow instances and the daily R2 objects.
