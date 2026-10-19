# Gmail Campaign Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in this session. Do not delegate unless the user explicitly requests it.

**Goal:** Optionally send saved promotion and confirmed IT-completion details into approved existing Gmail conversations without exposing the mailbox or weakening campaign storage.

**Architecture:** Extend the existing sync Worker with isolated email modules and dedicated D1 tables. Verify individual Microsoft identities on the server for email operations, use server-granted permissions, and send through a durable transactional outbox. Keep all email features disabled until account-owner configuration and tests pass.

**Tech Stack:** Cloudflare Workers, D1, Web Crypto, Google OAuth/Gmail API, existing MSAL frontend, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-gmail-campaign-thread-design.md`

## Global constraints

- Sender: `it@rocks-foods.com`; sender authorization is separate from staff login.
- First release: promotion submission and confirmed IT completion; no NPD, powder, or ERP event yet.
- Admin/IT curate approved conversations; MKT/RD never search the mailbox directly.
- Never trust localStorage roles, client-provided actor names, or the shared sync token as email authorization.
- Email optional; campaign mutation and opted-in outbox insertion commit atomically. Never send before commit.
- No mailbox bodies/attachments in normal-user responses, no secrets in frontend/generic store, no new-message fallback for missing threads.
- No live migrations, account changes, deployments, or recipient emails without separate authority. Preserve all existing workspace changes.
- A plan approval is required before implementation. Choose inline execution; the user can change that choice.

## Review focus

1. Identical subjects/campaign names: bind stable server identifiers, never select the first name match.
2. Revoked conversation or changed recipients after preview: stale confirmations fail closed.
3. Timeouts after Gmail acceptance: needs-verification, not a blind retry.
4. Browser closed during send: dispatcher continues independently; saved work remains saved.
5. User enters long Thai details/HTML-like text or external recipients: escaped content, allowlisted fields and recipients only.

## File map

- New `sync-worker/email/{identity,router,oauth,gmail,registry,outbox,templates}.js`: separate staff identity, route policy, credential lifecycle, provider protocol, thread publication, dispatch, and safe content rendering.
- New `sync-worker/migrations/0005_campaign_email.sql`: additive email tables and unique event/confirmation constraints; check existing migration numbering before selecting the final number.
- Modify `sync-worker/worker.js`: explicit gated email routes, transaction integration, scheduled dispatcher; leave ordinary sync authorization unchanged.
- Modify `sync-worker/wrangler.toml`: documented email-disabled defaults and scheduled trigger, enabled only during separately approved rollout.
- New `js/campaign-email.js`, `pages/Email_Settings.html`: optional form binding and Admin/IT controls; no provider tokens in browser.
- Modify `Potato Corner Promotion System.html`: email feature loader and explicit Microsoft API consent/token acquisition, isolated from existing login behavior.
- Modify `pages/{Proposal,Coupon,BillDiscountProposal,VoucherProposal}.html`, `js/{cloud-store,mock-backend}.js`: optional email selection and commit receipt integration.
- Tests: `tests/email-{identity,oauth,registry,outbox,transaction,templates}.test.cjs`, `scripts/test-campaign-email-browser.cjs` using isolated D1 and mocked Gmail.

## Task 1: Validate identity configuration and implement fail-closed authorization

**Consumes:** existing Microsoft login, currently requesting Graph `User.Read` in the shell; shared sync bearer in Worker.
**Produces:** `verifyEmailActor(request, env) -> Promise<{tenantId, objectId, permissions}>`; `requireEmailPermission(actor, permission)`.

- [ ] Record the Entra application/tenant identifiers already in the shell as configuration candidates, not credentials. Confirm owner can expose an API scope for this Worker and grant staff access. Obtain API audience/scope and initial server-managed staff mappings. Stop at this configuration gate if unavailable; do not accept a Microsoft Graph token as a token for this API.
- [ ] Write tests asserting forged/local roles, wrong issuer/audience/tenant, expired/tampered tokens, shared-sync-token-only requests, unknown staff, and unauthorized MKT mailbox search all return 401/403.
- [ ] Run `node --test tests/email-identity.test.cjs`; confirm RED for missing implementation, not environment errors.
- [ ] Implement JWT verification against fixed tenant OpenID/JWKS configuration with issuer/audience/time checks and server-side staff lookup. Cache keys with bounded refresh; fail closed on validation failure. Roles derive from protected staff records, keyed by tenant/object ID, not editable generic store keys.
- [ ] Run the identity suite GREEN; test normal campaign sync is unchanged; commit only task files.

## Task 2: Dedicated storage and owner-only Gmail OAuth

**Consumes:** Task 1 actor and permission checks.
**Produces:** `beginGmailAuthorization(actor, env) -> {url}`, `completeGmailAuthorization(request, env) -> connectionSummary`, `getGmailAccessToken(env) -> string`.

- [ ] Tests: single-use/expired/wrong-session state; wrong sender account; disconnect; encrypted token storage; no token values in logs or generic store/export responses.
- [ ] Run `node --test tests/email-oauth.test.cjs` RED.
- [ ] Create dedicated tables for staff, connections, OAuth state, approved threads, bindings, confirmations, outbox and audit. Use AES-GCM for persisted refresh tokens with a versioned key in Worker secrets. Bind consent/callback to verified Super Admin; do not provision actual Google resources automatically.
- [ ] Gmail scopes: `gmail.readonly` for subject search/header retrieval and `gmail.send` for sending; disclose restricted read scope and review requirements. Read scope is not limited to a label; application policies enforce selective publication.
- [ ] Document owner setup for Google Cloud project, consent, OAuth client/redirect URI, client secret and encryption key. Reconnect uses existing account identity checks; revoked/expired credentials pause delivery.
- [ ] Run OAuth/storage suites GREEN and commit scoped files. All provider calls mocked.

## Task 3: Approved conversation registry and preview

**Consumes:** Task 1 verified actor; Task 2 connection.
**Produces:** `searchGmailHeaders(actor, query, pageToken)`, `publishThread(actor, input)`, `listApprovedThreads(actor, query)`, `confirmCampaignMail(actor, input) -> {confirmationId, expiresAt}`.

- [ ] Tests: duplicate subjects remain distinct; unauthorized or unpublished IDs rejected; external To/CC explicitly approved; sender excluded; address normalization/deduplication; CRLF injection rejected; changed versions invalidate confirmation; no body/snippet leak.
- [ ] Run `node --test tests/email-registry.test.cjs` RED.
- [ ] Implement paginated admin metadata search and opaque public IDs. Publish only chosen header fields, audience, approved recipients, and content policy. Default audience is explicit staff assignment, not every user. No ordinary user gets a raw mailbox-search endpoint.
- [ ] Confirmation lasts 15 minutes and binds actor, server campaign identity/month/revision, thread version, recipients, event policy and rendered-content hash. New campaign identity is minted by the server for the prepared submission, not inferred from name/row index. Validate existing campaign access independently.
- [ ] Implement server-side safe text/HTML preview using field allowlists. Never auto-add recipients from a later message. Run registry/templates tests GREEN; commit scoped files.

## Task 4: Atomic business events and outbox delivery

**Consumes:** confirmed Task 3 binding; existing version-guarded D1 batch writes and immutable submission receipts.
**Produces:** `prepareCampaignMail(db, actor, confirmation, event) -> D1PreparedStatement[]`; `dispatchEmailBatch(env) -> deliverySummary`.

- [ ] Tests: mutation failure/outbox failure roll back together; no event on code confirmation alone; duplicate save/parallel dispatch send once in the normal case; separate revision completion creates a distinct event; changed/revoked publication cancels or pauses pending send.
- [ ] Run `node --test tests/email-transaction.test.cjs tests/email-outbox.test.cjs` RED.
- [ ] Hook only opted-in verified requests into `/promo/submissions` and the persisted IT completion transaction. Audit the current completion write route and add a dedicated version-guarded completion endpoint if generic key writes cannot validate the transition safely; keep non-email legacy behavior compatible. Never infer completion from the client notification helper.
- [ ] Event key: stable campaign ID + month/revision ID + server event ID/type; unique DB constraint and leased dispatch state. Persist safe content/recipient snapshot atomically with event and business receipt; store campaign identity outside client-writable email configuration.
- [ ] Construct replies using Gmail thread ID, original subject, RFC `In-Reply-To` and `References`; exclude BCC and no new-message fallback. Persist provider acceptance separately from campaign success/delivery/read status.
- [ ] Retry explicit 429/5xx rejection after 1, 5, 15, 60 and 240 minutes with jitter and provider Retry-After floor; stop after six attempts including initial. Ambiguous network/acceptance/lease loss enters needs-verification; never automatically retry uncertain sends. Recheck revocation and global kill switch before each send.
- [ ] Test lost provider response, audit-write failure after send, worker restart, expired lease, closed browser and token revocation. Run suites GREEN and commit scoped files.

## Task 5: Promotion form and administration UI

**Consumes:** approved registry, preview/confirmation endpoints and save/mail outcomes.
**Produces:** `PC_CampaignEmail.mount(formContext)`, `prepare() -> optionalConfirmation`, `renderOutcome(receipt)`; admin connection/registry/history controls.

- [ ] Browser tests RED: optional skip preserves all four existing form workflows; MKT sees only published assigned threads; no direct mailbox query; recipient/content preview and confirmation invalidation; failed save preserves form; saved campaign/email failure are clearly distinct.
- [ ] Add optional section without changing existing button names or reducing text readability. Implement TH/EN labels through existing i18n convention. Use existing theme and horizontal-table behavior, not the rejected stacked tracking layout.
- [ ] Add Admin/IT controls respecting server permissions; local navigation visibility is convenience only. Show subject, latest header date and approved recipients, not private mailbox content. Super Admin connection controls never expose secrets.
- [ ] Include authenticated campaign link; never attach raw mailbox content, internal IT notes, rejection details or existing files by default. Test long Thai and HTML-like campaign text.
- [ ] Run `PLAYWRIGHT_MODULE=/Users/oneday/.npm/_npx/e41f203b7505f1fb/node_modules/playwright node scripts/test-campaign-email-browser.cjs`; all mail mocked. Commit scoped files.

## Task 6: Verification and controlled activation handoff

- [ ] Run `node --test tests/*.test.cjs`; require all existing and new tests pass.
- [ ] Run existing Tracking and OP browser workflows and all four form revision workflows. Confirm no accidental Gmail request from unrelated pages and no production writes in tests.
- [ ] Perform security review against spec: shared-token bypass, cross-user campaign/thread access, secrets, recipient changes, HTML injection, duplicate/uncertain sends and missing thread behavior.
- [ ] Prepare deployment runbook with feature disabled, explicit config checks, D1 backup before additive migration, kill switch, rollback preserving business data and credential revocation instructions. No live migration/deployment during plan execution without separate approval.
- [ ] Ask owner to authorize Gmail only after configuration review; conduct a separately approved pilot with explicit internal Gmail/Outlook recipients, never real partners by default. Verify thread headers and recipient lists; explain provider acceptance vs delivery.
- [ ] Enable wider audience only after owner approves pilot results. Pending emails must not be released in a batch without explicit approval.

## Handoff

Review this plan and confirm inline execution before code changes. Tasks 1 and 2 require organization-owned identity/API and Google OAuth configuration; if those are unavailable, report the exact missing configuration and keep live email disabled. Do not request passwords or secrets in chat.
