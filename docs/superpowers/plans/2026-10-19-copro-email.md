# Co-Promotion Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement inline, task by task. Steps use checkbox syntax. Implementation begins after the user reviews this plan; no implementer delegation is requested.

**Goal:** Send two controlled Co-Promotion replies into one approved existing conversation: initial announcement, then combined IT-plus-Interface completion.

**Architecture:** Extend the existing verified Gmail connection with protected permissions, approved conversations, verified campaign ownership/completion evidence and a transactional D1 outbox. Keep normal campaign saving independent when email is not selected. Default to disabled; live test recipients are entered and explicitly confirmed by the user, never inferred from a Subject or browser role.

**Tech Stack:** Cloudflare Workers/D1, Web Crypto, existing MSAL Browser, Gmail API, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-copro-email-design.md`, approved 2026-10-19.

## Global constraints

- Sender `it@rocks-foods.com`; test conversation Subject `Test send to email copro UOB`. The Subject grants no permission to contact UOB.
- Only Co-Promotion, two milestones `submitted` and `it_interface_complete`, one ordinary event per campaign/month/milestone. No automatic revision resend or historical backfill.
- IT and Interface must both succeed for every applicable active button. A completely cancelled campaign does not qualify. Allocation/confirmation of a code is not IT completion.
- Same-origin `/email/` proxy, existing fixed origin and secret-safe OAuth behavior remain unchanged. Email routes bypass service-worker caching.
- No shared bearer, localStorage role, mutable name or unverified completion flag can authorize or trigger sending. Dedicated tables never enter generic store exports.
- Test addresses may be external, but only explicitly entered/confirmed addresses in a separately approved test conversation are eligible. No automatic Reply All during testing.
- No real migration, deployment, owner consent, partner send or secret configuration during implementation. Live activation requires the runbook prerequisites and explicit approval.
- Preserve dirty deployed work. Do not stage mixed existing files or manufacture a whole-file baseline commit; keep scoped execution evidence in `.superpowers/sdd/2026-10-19-copro-email/progress.md`.

## Existing-flow decision

`PC_CoPromo.promptAfterSubmit` currently opens the Co-Promotion form after the primary promotion commits. Preserve that sequence: the first announcement is queued when the initial Co-Promotion record, loop and recipient confirmation commit, with a verified primary-promotion receipt already present. Closing that form leaves the primary promotion saved but sends nothing. Do not label the primary save alone as “email sent”.

To prevent claiming somebody else's campaign by display name, capture the verified staff identity when a new pilot primary promotion is submitted. This creates a protected campaign UUID and owner mapping but sends no mail. Existing primary submissions remain available without email; old/unverified receipts cannot be silently adopted into the pilot. No retroactive campaign ownership is inferred.

## Review focus

1. A shared-sync client changes campaign or Co-Promotion flags: no mail event or completion evidence may be created from those writes.
2. Two similarly named campaigns/months or two buttons with overlapping codes: stable protected IDs must prevent cross-campaign recipients/completion.
3. Recipient policy changes after preview or before dispatch: no silent expansion or delivery to revoked recipients.
4. Gmail may accept a send before a timeout or D1 acknowledgement failure: no blind resend; expose needs-verification.
5. Multiple buttons/records, either completion order, cancellation or deleted/revised work while queued: hold or invalidate stale work rather than send an inaccurate completion notice.

## File boundaries and contracts

Extend `sync-worker/email/identity.js` with `verifyEmailActor(request,env,deps={}) -> {tenantId,objectId}` and `requireEmailPermission(actor,permission,env)`. Preserve `verifyEmailAdmin` and every existing connection grant test. New permissions are `manage`, `submit`, `it`; email administrator grants imply manage but do not bypass per-campaign ownership checks for ordinary submitters.

Create focused modules under `sync-worker/email/`:

- `gmail.js`: allowlisted provider HTTP, metadata search/detail, RFC reply creation and send classification.
- `registry.js`: administrator-approved conversations and audience/recipient policy versions.
- `copro-model.js`: pure validation, canonical business snapshots, stable button membership and milestone predicate.
- `copro-service.js`: verified business commands, ownership, version checks and transactional event statements.
- `outbox.js`: leased dispatch, immutable snapshots, retry and needs-verification handling.
- `templates.js`: allowlisted bilingual text/HTML email content; no internal remarks or attachments.
- `copro-router.js`: API request validation/permissions only; called inside the existing email router after connection-route handling.

Add migration `sync-worker/migrations/004_copro_email.sql` after confirming no competing004. Dedicated tables:

- `email_actor_permissions(tenant_id,object_id,permission,enabled)` composite primary key.
- `email_threads(id,thread_id,message_id,rfc_message_id,references_json,subject,to_json,cc_json,audience_json,version,mode,enabled,published_by,updated_at)`; id is opaque UUID, mode initially only `test`.
- `email_campaigns(id,campaign_key,month,submission_id,owner_tenant,owner_oid,source_hash,version,status)` unique campaign_key/month/submission_id; id is a UUID, never title-only identity.
- `email_copro_records(id,campaign_id,button_id,record_json,interface_done,interface_by,interface_at,version)`; protect business records from generic store mutation.
- `email_campaign_buttons(campaign_id,button_id,source_identity_json,it_done,it_by,it_at,cancelled,version)` primary key campaign_id/button_id.
- `email_bindings(campaign_id,thread_id,policy_version,recipients_json,content_hash,confirmed_by,confirmed_at,version)` primary key campaign_id.
- `email_outbox(id,event_key,campaign_id,binding_version,snapshot_json,status,attempts,next_attempt_at,lease_token,lease_until,provider_id,sanitized_error,created_at,updated_at)` unique event_key.
- `email_audit(id,campaign_id,actor,event,details_json,created_at)`; details exclude credentials and full mailbox history.

`event_key = campaign UUID + ':' + month + ':' + milestone`. Identifiers and timestamps come from verified commands/server time. One campaign binding governs all its initial Co-Promotion button records; records never create separate announcement emails per product row.

### Task 1: Verified staff permissions and additive storage

**Files:** identity module, migration004; `tests/copro-email-identity.test.cjs`, `tests/copro-email-storage.test.cjs`.

**Interfaces:** produces verified actors and protected schema consumed by Tasks2–5. Identity tests use real locally signed RSA tokens, injected JWKS and isolated SQLite, not a production account.

- [ ] Write failing tests: submit-only identity cannot search/manage or complete IT; forged browser roles/shared tokens fail; revoked actor grant fails; an owner and another staff identity with the same display name remain distinct. Existing connection-admin access remains unchanged.
- [ ] Run `node --test tests/copro-email-identity.test.cjs tests/copro-email-storage.test.cjs`. Expected RED: missing new interfaces/schema.
- [ ] Extract token verification from `verifyEmailAdmin` without weakening its pinned issuer/audience/algorithm/scope checks. Add protected permission lookup; no browser-provided permission fallback.
- [ ] Apply migration to isolated current schema. Assert old campaign rows remain byte-identical and generic store enumeration excludes every new table.
- [ ] Rerun targeted tests and `node --test tests/email-connection*.test.cjs`. Expected all pass. Record scoped files/test evidence, no remote SQL.

### Task 2: Approved conversation registry and safe Gmail reply protocol

**Files:** `gmail.js`, `registry.js`, `templates.js`, `copro-router.js`; `tests/copro-email-registry.test.cjs`, `tests/copro-email-gmail.test.cjs`.

**Interfaces:** `searchThreads(actor,query,env,deps) -> {items,nextPageToken}` requires manage; `publishThread(actor,input,env,deps) -> {id,version,summary}` requires manage; `listApprovedThreads(actor,env) -> summaries` applies protected audience. `buildReply(snapshot) -> {raw,threadId}` and `sendReply(connection,snapshot,deps) -> {outcome:'accepted'|'rejected'|'ambiguous',providerId?,retryable?}` stay server-side.

- [ ] Write tests for identical Subjects/different thread IDs, metadata-only search, unauthorized audience, revoked thread, stale version, CR/LF header injection, UTF-8 Thai Subject/content, To/CC normalization, sender exclusion and no BCC inference.
- [ ] Run both new suites. Expected RED from missing implementations.
- [ ] Implement fixed Gmail endpoints with bounded timeouts and sanitized errors. Fetch headers only for the selection UI; ordinary users never see Gmail internal IDs, mailbox body, snippets or attachments. Search is paginated, maximum20results/request.
- [ ] Publish a concrete original message plus exact Subject/RFC references and an approved recipient policy. Test mode requires exact chosen test recipients; never populate an unchecked Reply All list as authorized recipients.
- [ ] Implement multipart text/HTML MIME with base64url encoding and RFC In-Reply-To/References. Content includes saved promotion details, codes/dates and milestone; excludes internal remarks, rejection notes, files and secrets. Missing target pauses rather than starts a fresh conversation.
- [ ] Expose `GET /email/threads/search`, `POST /email/threads`, `GET /email/threads` with independent actor permissions. Enforce exact-origin mutations and safe response bounds.
- [ ] Dispatch these registered CoPro/thread route prefixes before the existing connection router's administrator-only gate; their own verified-actor permissions apply. Keep connection management strictly administrator-only and never fall through unknown email paths into legacy shared authorization.
- [ ] Run targeted tests plus Task1. Expected GREEN, no provider calls outside mocks.

### Task 3: Protected business commands and atomic milestone outbox

**Files:** `copro-model.js`, `copro-service.js`, `copro-router.js`, `sync-worker/worker.js`; scoped changes in `js/cloud-store.js`, `js/mock-backend.js`; `tests/copro-email-business.test.cjs`.

**Interfaces:** `registerPilotSubmission(actor,submission,env) -> {receipt,campaigns:[{id,key,month}]}`; `commitCoPromo(actor,command,env) -> {saved:true,mailStatus:'queued'|'not_selected',campaignId,version}`; `commitIT(actor,command,env)` and `commitInterface(actor,command,env)` return persisted business/mail status. Commands carry stable campaign/button IDs, expected versions and idempotency ID, never an arbitrary completed boolean.

- [ ] Write failed-save/outbox-failure tests and duplicate submission/Interface tests before implementation. Cover two same-name/month campaigns, another owner, forged shared-store IT flags, partial multi-button completion, both completion orders, zero active buttons and cancellation/revision invalidation.
- [ ] Run `node --test tests/copro-email-business.test.cjs`. Expected RED.
- [ ] Extract reusable submission transaction statement construction from `commitSubmission` without changing legacy response/receipt behavior. `POST /email/promo/submissions` uses the verified submit actor and protected UUID ownership in the same transaction as the primary campaign/counter/files/receipt. This step sends nothing.
- [ ] The primary submission response supplies protected campaign IDs to the existing post-submit Co-Promotion flow. No title-based ownership lookup. The initial Co-Promotion command validates exact primary receipt/source version, required Co-Promotion fields, owner, approved thread and preview confirmation; commits protected records/binding and one submitted outbox snapshot atomically.
- [ ] Reuse or extract the pure existing `saveSettlementBatch` row transformation for mail-enabled campaigns; do not execute a browser callback as server code. The verified IT route commits normal settlement data plus protected per-button evidence/version atomically. Interface uses stable record/button membership and commits protected interface evidence. Each transition runs the same aggregate milestone predicate and unique outbox insertion.
- [ ] Trust protected membership/evidence, never a generic `itStatus`/`interfaceSetup` write. Freeze an immutable first-announcement snapshot. If source/version changes after confirmation, require fresh confirmation; pause queued stale work. No automatic edit/resend or importing old campaigns.
- [ ] Add `POST /email/copro`, `POST /email/copro/:campaignId/it`, `POST /email/copro/:recordId/interface`, and authorized `GET /email/copro/:campaignId/status`. Request-body size limit1MiB; reject files/history fields. Legacy generic campaign sync alone must create no events.
- [ ] Run business tests, existing `tests/sync-worker*.test.cjs`, submission and Gmail-connection suites. Expected GREEN; normal non-email campaign persistence unchanged.

### Task 4: Durable dispatcher and delivery state

**Files:** `outbox.js`, Worker scheduled entry, config module/Wrangler disabled flags; `tests/copro-email-outbox.test.cjs`.

**Interfaces:** `dispatchEmail(env,deps={}) -> {accepted,failed,held}`. New flags default `EMAIL_COPRO_ENABLED=false`, `EMAIL_TEST_SEND_ENABLED=false`, `EMAIL_SEND_ENABLED=false`. Test sends require first two true and test-approved thread/recipient confirmation; production send remains unavailable in this pilot regardless of a browser flag.

- [ ] Write tests for two workers competing, policy revocation after queue, source cancellation while queued, expired lease before/after HTTP start, disconnect/generation changes, explicit provider rejection, provider timeout after possible acceptance and D1 failure after acceptance. Assert ambiguous outcomes are never blindly retried. Completion cannot dispatch ahead of its submitted announcement; failure/needs-verification of the first holds the second.
- [ ] Run outbox suite. Expected RED.
- [ ] Atomically lease a maximum5eligible events, lease120seconds, with a unique lease token. Recheck feature mode, connection generation, protected source/binding versions, thread enabled and exact confirmed test recipients before each provider call.
- [ ] Require the submitted event to be provider-accepted before leasing the completion event for that campaign. Authorized IT/Interface state changes alone do not invalidate the immutable submitted-detail snapshot; changed commercial details, membership, recipients or cancellation hold stale work until explicitly resolved.
- [ ] Persist `sending` before HTTP. An expired `sending` lease becomes `needs_verification`, not automatically queued. Accepted Gmail response records provider ID and acceptance, never recipient delivery/read. A definitely rejected429response may retry at60/300/900seconds (maximum3); auth/policy/permanent errors hold/fail. Transport/5xxambiguity goes to needs-verification unless provider evidence proves rejection.
- [ ] Expose `GET /email/copro/:campaignId/history` only to campaign owner/authorized staff. No generic “send arbitrary email” or unchecked retry endpoint. Audits identify queue/acceptance/failure/approval actors without tokens or mailbox bodies.
- [ ] Add Worker `scheduled` handler through `ctx.waitUntil(dispatchEmail(env))`. Do not enable a production cron yet; document a proposed minute interval for separately approved rollout. Isolated tests invoke dispatcher directly.
- [ ] Run outbox/business/connection suites. Expected GREEN; closing browser does not cancel committed queued work.

### Task 5: Co-Promotion selection, test preview and truthful Interface UI

**Files:** new `js/copro-email-client.js`, `js/copro-email-ui.js`; scoped additions to `js/co-promo.js`, `js/mock-backend.js`, `js/cloud-store.js`, `pages/Email_Settings.html`, `js/email-settings.js`, `pages/IT_Settlement.html`, `pages/InterfaceERP.html`, shell script loading; `scripts/test-copro-email-browser.cjs`.

**Interfaces:** `PC_CoProEmail.prepare({campaignId,coRecords}) -> confirmed binding draft|null`; `PC_CoProEmail.request(path,{method,body,interactive})` uses dedicated MSAL token only; `PC_CoProEmail.showStatus(result)` distinguishes saved/queued/accepted/failed. Follow existing green theme, TH/EN and responsive patterns; no UI redesign.

- [ ] Write browser harness before UI implementation: disabled mode, no automatic provider popup, administrator search/publish, normal-user approved summaries only, external test address entry, stale preview, cancellation preserving form data, initial announcement, IT-only, combined completion, repeated clicks and rejected Interface commit.
- [ ] Run `node scripts/test-copro-email-browser.cjs`. Expected RED; mock Gmail/MSAL and isolated D1 only.
- [ ] Add email settings subsection for authorized thread curation and pilot status. Do not expose full mailbox search to MKT or treat Admin navigation as server permission.
- [ ] For a new pilot submission, obtain verified actor binding and primary protected ID; default no mail when unavailable, with a clear message. Preserve non-email submit success. Existing post-submit Co-Promotion form lets the user select the approved test loop, enter test To/CC, inspect details/recipients and explicitly confirm before its save.
- [ ] A changed test recipient list requires administrator approval/versioned confirmation; submitting it cannot bypass the approved conversation policy. Do not request addresses in chat or prefill real partners. No send on selection/preview alone.
- [ ] Route opted-in Co-Promotion/settlement/Interface commands through the verified client. Disable duplicate action while pending, retain idempotency ID across retries, preserve code reservations and existing unrelated business workflows. No second browser PC_notify send for these email-enabled milestones.
- [ ] Replace Interface's empty catch/finally success with success only after acknowledged business result. Show “บันทึกแล้ว · รอขึ้นปุ่มครบ” or queued/accepted mail status accurately; failures leave retry available without claiming ACC was notified.
- [ ] Test1366px/390px, TH/EN, blocked/cancelled popup and no token in localStorage. Inspect screenshots in one batch and fix evidenced defects once. Run existing form-master-loading, all four promotion edit workflows and login tests. Expected GREEN.

### Task 6: Release handoff and bounded security review

**Files:** update `docs/gmail-connection-setup.md`, `.assetsignore` only if new private artifacts need exclusion, execution ledger; no real secret files.

- [ ] Document exact permission grant bootstrap, verified-owner limitations (new pilot submissions only), chosen test conversation/user-entered recipient approval, two milestones, ambiguous-send handling, feature kill switches and disabled cron. Distinguish connection-ready from send-ready.
- [ ] Run `node --test tests/*.test.cjs`, mocked CoPro/browser harness, `scripts/test-form-master-loading-browser.cjs` and existing shell form edit regressions. Expected all assertions pass; report any unrelated failures by name.
- [ ] Dry-run frontend/backend bundles. Verify tests/SQL/server modules/docs/credentials excluded from public assets, email endpoints never cached, and no production flags or schedules enabled. Expected exit0.
- [ ] One fresh whole-feature security review covers all five Review Focus cases. One bounded fix pass: concrete Important/Critical findings require RED→GREEN regressions and green full suite; minors documented, no endless re-review.
- [ ] Preserve scoped uncommitted edits/ledger in this dirty workspace rather than committing unrelated user files. Hand off implemented-but-disabled work with missing live prerequisites listed. Obtain separate approval before backup/migration/deploy, real owner consent or the first actual test send.

## Self-review and handoff

Coverage: identity/storage Task1; threading/approved recipients/content Task2; save/IT/Interface atomicity and ownership Task3; delivery/duplicates/ambiguous responses Task4; selection/test-address entry/errors/i18n Task5; regression/security/rollout Task6. Each Review Focus item has explicit tests in Tasks2–4. Signatures and event names above are shared contracts; implementations must not invent alternate names silently.

Recommended execution: **Native / inline**, preserving the previous connection implementation workflow. The verified business transactions, outbox and UI depend on shared sequential contracts, so one implementer plus one final fresh reviewer keeps those boundaries coherent. Review this plan before code changes. Exact live test recipients can be entered later in the UI; they are not required to develop mocked tests.
