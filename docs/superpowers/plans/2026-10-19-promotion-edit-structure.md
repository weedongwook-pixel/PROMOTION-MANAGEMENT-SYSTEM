# Full Promotion Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in this session after plan review. Do not delegate without explicit user authorization. Steps use checkbox syntax for tracking.

**Goal:** Let the original reporter add/remove/reorder POS buttons and edit their items and attachments in the existing proposal form without losing existing codes or Cloud history.

**Architecture:** Extend the shared browser/Worker revision model with explicit new-button identities and ordered structural edits. The existing guarded D1 edit transaction will atomically persist the campaign, new allocations, staged attachments, activity and receipt. Add progressive controls to the existing forms rather than introduce a replacement editor.

**Tech Stack:** Existing JavaScript forms, Cloudflare Worker/D1, Web Crypto, Node test runner, Playwright/Chrome.

**Spec:** `docs/superpowers/specs/2026-10-19-promotion-edit-structure-design.md` — user approved 2026-10-19.

## Global Constraints

- Original reporter ownership and the designated existing test account policy remain unchanged. Do not claim these are newly server-verified identities.
- Keep campaign name/key, target month, owner and proposal form type fixed. No whole-campaign creation/deletion in edit mode.
- Keep existing button codes; allocate new codes only on successful Cloud commit using the existing form-specific policy. Item Set assignment remains under the existing IT workflow.
- Removed-button codes are not automatically returned. Prior complete rows remain in immutable edit history.
- Require a reason for previously IT-processed work; send it back to IT and OP with explicit structural changes.
- Original reporter/date, other months, original attachments and unknown business fields must survive unless explicitly edited.
- New buttons must not inherit completed workflow state, product-master links, original codes or attachments from a neighboring button.
- No product deployment, production writes or real code allocation during implementation. Deployment needs a current D1 backup and confirmed access.
- Preserve pending local simplified Coupon controls; no unrelated UI, email, auth or sorting changes.

## Review Focus

1. Rename/reorder/remove/add together must not confuse button ownership or reuse removed reservations.
2. New buttons after completed IT work must be pending and cannot inherit Item Set/master/recipe completion evidence.
3. Concurrent edits or unrelated counter/file changes must roll back all writes; lost responses must replay the same receipt without reallocating.
4. Attachment upload or validation failure must preserve the form and old file; historical attachments remain accessible.
5. An opened old form must not resurrect a removed button, overwrite another month, or reset explicit Net zero to an empty/default value.

## File Map

- Modify `js/promotion-edit-model.js`: existing/new identities, validation, ordered revised rows, structural summary, original-code protection.
- Create `js/form-code-allocation.js`: storage-free allocation primitive shared by normal submission and edit staging; no new numbering policy.
- Modify `js/mock-backend.js` and `Potato Corner Promotion System.html`: use/load shared allocation primitive without changing normal submission receipts.
- Create `sync-worker/promotion-edit-resources.js`: server-owned allocation/file staging for new/edit buttons and returned guarded extra writes.
- Modify `sync-worker/worker.js`: call resource staging and include extra writes in the edit transaction and receipt.
- Modify `js/promotion-edit.js`: structure controls, collection and async file read; existing four proposal pages only where their controls lack edit hooks.
- Modify `js/cloud-store.js`: send ordered edits with staged file inputs and capability handling; retain idempotent Cloud receipt checks.
- Modify `js/i18n.js`: only new edit-control labels/confirmation/error messages.
- Tests: existing `tests/promotion-edit-model.test.cjs`, `tests/sync-worker-promotion-edit.test.cjs`, `tests/promotion-edit-cloud.test.cjs`, `tests/cloud-first-forms.test.cjs`; new `tests/form-code-allocation.test.cjs`, `tests/promotion-edit-resources.test.cjs`; extend `scripts/test-promotion-edit-browser.cjs`.

## Task 1: Ordered structural revisions with protected identities

**Interfaces:** `applyRevision(original, form, context) -> campaignBlock` retains its signature. Existing IDs must resolve against the original. New buttons use `{id:'new:<opaque-id>', isNew:true, ...}` and must not carry an existing row ID. Persistent new IDs derive from the committed edit ID plus new-button position on the server and identically in validation.

- [ ] Write failing model tests: preserve codes on rename/reorder; remove a button without returning codes; add a button with blank codes and pending state; reject copied/duplicate/forged identities; require at least one button/item; preserve other months and dates.
- [ ] Run `node --test tests/promotion-edit-model.test.cjs`; require failures specifically caused by fixed-set restrictions.
- [ ] Replace the fixed button-count restriction with explicit existing/new validation. Construct new rows from an allowlisted campaign template, not a full copied old row. Ignore injected code/workflow fields.
- [ ] Persist order using row array order plus explicit `buttonOrder`; record added/removed/moved/modified labels in `revisionChanges`. Existing grouping consumers must continue to respect saved order.
- [ ] Add tests for removal+rename+reorder in one edit, explicit Net zero/missing Net, previously completed IT work and stale product-row identities.
- [ ] Run model and existing revision tests GREEN. Review scoped diff; do not stage unrelated or previously untracked deployed files wholesale.

## Task 2: Reuse allocation policy and stage server-owned resources

**Interfaces:** `reserveFormCode(state, {type,tag,campaign,shortName,actor,at,fieldId}) -> {code,changed}` mutates only a caller-owned clone. `prepareEditResources(db,{original,next,form,editId,actor,now}) -> {next,writes:[{key,value,expectedUpdatedAt}]}` stages new reservations and files without writing DB.

- [ ] Write failing allocator tests reproducing current Coupon `IC`/4, Bill `BD`/3, Voucher `VC`/4 policies, cursor and reservation collision behavior. Assert no browser storage access and no allocation for existing buttons.
- [ ] Extract existing `cloudReserveFormCode` mechanics into the shared primitive; normal forms keep their established field keys and idempotence. Add the module before mock-backend in the boot list and update dependency-count assertions deliberately.
- [ ] Write failing resource tests: new Coupon/Bill/Voucher reservations, Item Set no invented assignment, deleted reservation never reused, incompatible existing channel/type change rejected with an explanatory message, no client-supplied new codes accepted.
- [ ] Implement server staging with expected counter versions. Validate staged attachment name/MIME/base64/size against existing limits; generate file IDs server-side, preserve old file references and keep removed files in historical storage.
- [ ] Test malformed upload, changed type requiring incompatible prefix, duplicate names, allocation exhaustion/unseeded counter and missing counter registry.
- [ ] Run `node --test tests/form-code-allocation.test.cjs tests/promotion-edit-resources.test.cjs tests/cloud-first-forms.test.cjs` GREEN; verify old form allocations remain identical.

## Task 3: Atomic edit transaction and compatible capabilities

**Interfaces:** `/promo/campaign-edits` retains existing receipt/version fields. Request form adds explicit new identities and optional per-button staged attachment data. Include resource registry versions in the final immutable receipt. Add a read-only capability field/endpoint identifying structural edit support so newer UI cannot submit unsupported edits to an older Worker silently.

- [ ] Locate existing Worker edit transaction tests and add RED cases for campaign+counter+files+activity+receipt atomicity and failure rollback.
- [ ] Stage resources after validating ownership/original campaign version and before assembling D1 statements. Guard each extra key with its original version in the same `db.batch` as campaign/activity/receipt.
- [ ] Preserve request hashing across retries; replay returns the exact original receipt without staging/allocating again. A replay must also work after the counter changed for another campaign.
- [ ] Record complete previous rows and structural changes in immutable activity, including removed codes and actor/reason. Never write counter releases here.
- [ ] Add race tests for campaign, deletion tombstone, counter and attachment registry changes during commit; lost receipt response; concurrent two-tab additions; stale form resurrection. Check all tables unchanged on failed batch.
- [ ] Run Worker transaction and all existing Cloud-first suites GREEN. No live migration is expected; do not add one unless schema evidence requires it and report the change before rollout.

## Task 4: Original-form add/remove/reorder and attachment controls

**Interfaces:** `PC_PromotionEdit.moveButton(blockId,direction)` moves DOM siblings; `collect()` returns ordered form state, and `save()` prepares uploaded files before the existing confirmation/Cloud save. New blocks receive temporary IDs and fresh item IDs, never another block's identity.

- [ ] Extend actual-browser harness RED for all four forms: Add Button, Remove Button, Up/Down, item add/remove, mixed Category/Subset, cancel and reopen order. No real Cloud requests.
- [ ] Restore button creation/removal controls only within the single edited campaign. New button helpers must initialize compatible type/channel controls and attach the edit identity/toolbars without clobbering form globals.
- [ ] Add keyboard-accessible Up/Down controls, disable boundaries and keep focus on moved control. Confirm deletion and prevent removing the final valid button.
- [ ] Keep old-name/month/owner boundaries visible and explain incompatible code-type transitions. Enable supported attachment replacements, asynchronously stage files in memory and keep previous references on read/upload failure.
- [ ] Ensure dirty detection includes structure/order/file changes but an untouched form still cancels without warning. Preserve explicit Net zero and do not coerce missing Net to zero.
- [ ] Add TH/EN labels through existing i18n. Retain Coupon simplified `ITEM/CATE/SUBSET` selection and make new controls readable within the existing horizontal table on notebook/mobile.
- [ ] Run actual forms through add+remove+move+save+reopen, both before/after IT completion. Validate reason focus and IT revision summary. Inspect desktop/mobile screenshots once, fix findings in one batch, confirm once.

## Task 5: Verification and deployment handoff

- [ ] Run `node --test tests/*.test.cjs` and require a fully green suite; explicitly report any failure by name.
- [ ] Run `scripts/test-coupon-category-browser.cjs` plus full `scripts/test-promotion-edit-browser.cjs --shell --test-mkt --revision` with the new structural cases, and Tracking/OP workflows. All external business writes remain mocked.
- [ ] Review invariants manually against the approved spec: no client-chosen new codes, no implicit release, no completed-state inheritance, no unrelated month/key rewrite, full audit and atomic receipt, unchanged original submission path.
- [ ] Prepare backend-first compatible rollout instructions. Recheck Cloudflare access (previous audit returned 7403), obtain current D1 backup, then separately request deployment authority. Frontend must explain unavailable capability instead of exposing nonfunctional structural actions.
- [ ] Verify deployed bytes/capabilities and perform separately authorized controlled pilot only after implementation and deployment approval. Do not claim readiness based on local tests alone.

## Handoff

Plan requires review before implementation. Recommended execution is inline/native in this session because model, transaction and form identity changes share state and a heavily modified deployed checkout. Before edits, obtain explicit consent to work in the existing checkout (preserving all changes) or prepare an isolated workspace containing the actual deployed dirty baseline; Git HEAD alone is not that baseline. Do not automatically create a worktree from HEAD or dispatch agents.
