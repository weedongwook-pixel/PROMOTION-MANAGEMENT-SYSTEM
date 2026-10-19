# Cloud-first migration (production safety plan)

## Current state (2026-10-02)

- Production D1 `potato-promo` was exported again before migration to `private-backups/potato-promo-20261002-1947-bkk.sql`. SQLite restore in memory passed `PRAGMA integrity_check=ok`; 341 `promo_store` keys and 135 history rows were present. A separate source archive and verification record are documented in `private-backups/README-20261002-1947-bkk.md`.
- The backup path is excluded from Git and Worker static assets; the SQL file has mode 0600. Production may continue changing after this snapshot, so export again immediately before any live cutover.
- Current writes: form -> `js/mock-backend.js` in-memory store -> `localStorage` (`pc_mock_store_v28`) -> `js/cloud-store.js` per-campaign sync -> direct Cloud readback. The save UI waits for sync/readback, but local storage quota can block a submission before the Cloud request.
- Current reads and edits across IT, Tracking, NPD, code reservations, attachments, and other modules still depend on browser storage. Do not disable `localStorage` globally or delete existing browser data during migration.
- Local development has an **unused, default-disabled** Cloud-first Worker transaction route (`POST /promo/submissions`, gated by `CLOUD_FIRST_ENABLED=true`) and browser adapter methods (`prepareCampaignWrites`, `commitSubmission`, `submissionReceipt`). The route writes campaign keys and optional code/file keys plus an immutable receipt in one D1 batch with version checks. The migration SQL has not been applied to production, and neither Worker nor frontend has been deployed.
- The four promotion submission forms (Item Set including E-Voucher, Coupon, Bill Discount, Voucher) now have opt-in-only Cloud-first branches (`window.PC_CLOUD_FIRST_FORMS === true`). They stage campaign rows, code reservations, and file attachments in memory and commit them together before refreshing the browser cache. Their no-local-first unit tests pass, but end-to-end staging tests against D1 and all downstream IT/OP paths remain open. The flag is not enabled anywhere; production behavior has not changed.
- Release blocker: the current sync token is included in browser code and user identity comes from browser storage. The new endpoint must not be advertised as user-authenticated until server-verifiable login/session authorization is in place. IT/OP code-management flows still use the legacy browser-first path and must be migrated before the switch.
- Data-preservation baseline: `scripts/verify-cloud-snapshot.mjs` restored the pre-change D1 export in memory and found 341 keys, 135 history rows, 275 campaign keys, 1,239 item rows, 588 working/button rows, 4 NPD jobs, 1 flavor job, 126 code reservations, and 11 attachments. The 19:23 and 19:47 exports had identical key/value content digests despite version timestamp movement. Run this comparison again against a fresh pre-cutover export and a post-cutover export; investigate every changed key rather than relying on counts alone.

## Target contract

1. Cloudflare Worker validates the logged-in user and accepts a stable submission ID (idempotency key). Browser form state may exist in memory, but no submitted campaign, code reservation, or attachment is persisted as a browser-side source of truth.
2. Worker writes the campaign's complete item rows and an independent submission receipt atomically to D1, and returns the committed version and saved button count. A retry with the same ID must return the existing result, not create duplicates.
3. Concurrent edits require the last observed version; conflicts return a visible conflict instead of overwriting newer work. Multi-campaign requests must report each campaign's committed result unambiguously, or commit as one transaction.
4. All read surfaces (IT, Tracking, dashboard, Log, item-set builder) load the committed Cloud state. They never re-upload a stale browser snapshot.
5. The form displays success only after a committed Cloud response. On network failure it preserves the current unsent form in memory and does not clear it. The UI must distinguish `not committed`, `committed`, and `outcome unknown`; a timeout after a write is resolved using the idempotency key before retrying.
6. Failed/unconfirmed submissions do not appear as saved. If a previously confirmed receipt exists but its campaign rows are missing, Log surfaces a loss alert and links to IT recovery; cross-device detection cannot rely only on a local attempt record.
7. Any deliberate offline-draft feature must be separate and opt-in; there is no silent local-first save path.

## Safe sequence

1. Introduce and test a Worker-side Cloud submission/read contract, authentication, idempotency, version checks, and durable receipts. Keep the existing production write path unchanged during this stage.
2. Migrate the four promotion submission forms together with code reservation and attachment handling. Use a feature flag in staging; test retry, quota-full browser, simultaneous users, partial/multi-campaign saves, refresh during save, and Cloud readback.
3. Migrate IT/OP edits and all other browser-backed modules to Cloud reads/writes. Replace the whole-store browser cache with in-memory views loaded from Cloud only when every consumer has been updated.
4. Take another D1 export, perform a staged cutover, verify row/button counts and Log/Tracking against Cloud, then deploy with a rollback path. Never restore an old whole-database snapshot over live data to roll back code.

## Release gate

Do not deploy a partial Cloud-first implementation or remove the legacy cache until all form, IT, Tracking, NPD, code, attachment, and permission flows have passed integration tests against a separate D1 test database. This plan does not itself change production behavior.
