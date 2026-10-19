# Promotion Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ส่งแก้โปรโมชั่นที่ IT ยังไม่เคยปิดงานผ่านฟอร์มเดิม โดยบันทึกแทนงานเดิมบน Cloud

**Architecture:** เพิ่ม edit context ที่เก็บแคมเปญ เดือน เวอร์ชัน และ stable button identities ในหน่วยความจำ ฟอร์มทั้งสี่ใช้ตัวเติมข้อมูลและ mapper แยกตามประเภท แล้วส่ง revision ไปยัง Cloud ด้วย transaction, IT-lock และ version guard ใช้ identity ของระบบปัจจุบันโดยไม่กล่าวอ้างว่าเป็น server authentication ใหม่

**Tech Stack:** Vanilla JavaScript, HTML partials, Cloudflare Worker/D1, node:test, Playwright

**Spec:** `docs/superpowers/specs/2026-10-15-promotion-edit-design.md`

## Global Constraints

- ผู้ใช้แก้เฉพาะงานตัวเอง; เจ้าของไม่ชัดเจนให้ติดต่อ IT
- IT เคยบันทึกปิดงานแล้วต้องล็อก รวมงานที่ถูกตีกลับภายหลัง
- คงผู้ส่ง/วันที่ส่งเดิม; เพิ่มผู้แก้/วันที่แก้แยกต่างหาก
- ไม่จองโค้ดใหม่เพียงเพราะเปิดแก้ไข ไม่เปลี่ยนแคมเปญหรือเดือนอื่น
- Cloud-first; ห้ามแจ้งสำเร็จก่อนตรวจใบยืนยัน Cloud
- ไม่เขียนข้อมูลทดสอบทับ TOTO จริงโดยไม่มีการยืนยันค่าที่จะเปลี่ยน
- ไม่ commit ไฟล์ dirty ของผู้ใช้รวมกับงานนี้; การ commit เฉพาะ hunks รอจนตรวจขอบเขตได้

## Review Focus

- ชื่อผู้ส่งซ้ำ/ไม่ปรากฏ: ปิดการแก้ไขเมื่อจับคู่ไม่ได้แน่นอน ไม่เดาจาก role
- Coupon/Voucher Online มีไฟล์เดิม: เปิดแก้และคงไฟล์ได้ ไม่บังคับเลือกใหม่โดยไม่จำเป็น
- IT ปิดงานระหว่างฟอร์มเปิด: ปฏิเสธทั้ง revision ไม่เขียนบางส่วน
- เปลี่ยนชื่อปุ่ม/แคมเปญ: คง identities และ codes; ย้ายชื่อแคมเปญแบบ atomic ไม่มีรายการเก่าค้าง
- การตอบกลับขาดหลัง commit: retry ตรวจ receipt เดิม ไม่สร้างแคมเปญหรือแจกเลขซ้ำ

---

### Task 1: Edit policy and lossless form model

**Files:** Create `js/promotion-edit.js`; test `tests/promotion-edit-model.test.cjs`

**Interfaces:** `policy(block, actor) -> {allowed, reason}`; `toForm(block, month) -> {form, campaign, buttons, metadata}`; `applyRevision(original, formRows, context) -> block`. Expose browser `PC_PromotionEdit` and CommonJS for tests. `context` includes campaign, month, expectedUpdatedAt and original button IDs. Form rows retain immutable IDs independent of names.

- [ ] Write failing tests: own PENDING allowed; other owner/ambiguous identity blocked; previous IT completion/rejection blocked; all four forms round-trip original rows including SS, quantity, 0 Net, files, dates and customer groups.
- [ ] Run `node --test tests/promotion-edit-model.test.cjs` and observe intended failures.
- [ ] Implement policy and normalized model without localStorage writes or counter allocation. Preserve unknown fields from original rows.
- [ ] Add revision tests: renamed buttons keep codes; untouched months identical; additions/deletions explicit; no silent field loss. Run tests green.

### Task 2: Atomic Cloud revision and client API

**Files:** Modify `sync-worker/worker.js`, `js/cloud-store.js`; create `tests/sync-worker-promotion-edit.test.cjs`, `tests/promotion-edit-cloud.test.cjs`

**Interfaces:** `POST /promo/campaign-edits` consumes `{editId,actor,campaign,month,expectedUpdatedAt,originalButtonIds,rows,newCampaign?}`; returns durable `{ok,editId,savedAt,versions}` receipt. `PC_CLOUD.loadCampaignEdit(campaign,month,actor)` returns original block/version plus policy; `PC_CLOUD.saveCampaignEdit(context,rows)` returns verified receipt.

- [ ] Write failing tests for unchanged-code replacement, wrong actor, missing actor, IT-lock from original D1 rows, stale versions, rename collision, source/target key move and tombstone update.
- [ ] Run the two new tests and confirm intended failures.
- [ ] Implement strict revision payload validation; perform original-record checks before a D1 transaction whose CAS checks the same loaded version. Reuse existing commit guard/history/receipt patterns. Do not accept caller-supplied IT status or original ownership as authoritative.
- [ ] Add counter-table CAS to the transaction only for explicit added/removed buttons, retaining codes referenced by other work. Validate any new reservation and refund against actual Cloud references.
- [ ] Implement client prepare/save/read-receipt calls with same editId on retry. Keep drafts in memory, never update browser campaign cache before acknowledgment.
- [ ] Test concurrent IT-close rollback, failed/partial transaction rollback, lost acknowledgment/replay and rejected duplicate editId; run tests green.

### Task 3: Tracking entry and form handoff

**Files:** Modify `js/campaign-tracking.js`, `pages/CreatePromotion.html`, `js/promotion-edit.js`, `Potato Corner Promotion System.html` (module list); test `tests/promotion-edit-navigation.test.cjs`

**Interfaces:** `PC_PromotionEdit.open(campaign,month)` reads Cloud and sets active context; `PC_PromotionEdit.current()` returns context; `PC_PromotionEdit.clear()` discards it; `PC_PromotionEdit.mount(formName)` fills the correct loaded form. Tracking exposes `ctEditProposal(rowIdx)`.

- [ ] Write failing tests: non-IT owner sees edit action; others do not; locked owner sees contact-IT explanation; Cloud blocked/no network cannot open editable cached work; navigation generation mismatch ignores late responses.
- [ ] Run tests red; add tracking action and handoff to proper CreatePromotion subform. No reuse of Admin inline editing permission.
- [ ] Provide editing banner, save-changes/cancel labels and unsaved-change navigation confirmation. Cancel must never save or reserve codes.
- [ ] Run navigation tests green.

### Task 4: Four existing forms load/save revisions

**Files:** Modify `pages/Proposal.html`, `pages/Coupon.html`, `pages/BillDiscountProposal.html`, `pages/VoucherProposal.html`, `js/mock-backend.js`, `js/promotion-edit.js`; test `tests/promotion-edit-forms.test.cjs`

**Interfaces:** Each form invokes `PC_PromotionEdit.mount('Proposal'|'Coupon'|'BillDiscountProposal'|'VoucherProposal')` only after its master-data initialization completes. Existing submission entry points branch to `PC_PromotionEdit.submit(formName,payload)` when an edit context exists; new submissions remain unchanged. Submit delegates mapping to Task 1 and persistence to Task 2.

- [ ] Write failing tests per form: Cloud rows populate all editable inputs, attached mappings retained, month/customer group/store filters retained, codes preserved on name change, incomplete Net blocked, legitimate 0 Net accepted.
- [ ] Run red; implement per-form adapters using existing addCampaign/add-button/add-row/selection helpers, setting original button identity on each generated card.
- [ ] In edit mode bypass new-submit allocation/clear-success flows, not validation. Existing attachments count toward required file validation; replacements staged only in atomic edit transaction.
- [ ] Add failure tests: form stays populated on network/version/IT-lock rejection and after receipt uncertainty; empty edit cannot erase campaign accidentally. Run all form tests green.

### Task 5: Audit and end-to-end verification

**Files:** Modify `js/submission-log.js` and edit success flow; create `scripts/test-promotion-edit-browser.cjs`, `tests/promotion-edit-log.test.cjs`

**Interfaces:** Successful edit produces one `EDITED` audit event with original submission identity, original actor, editor, timestamp and edit receipt ID. Do not count it as a new campaign submission.

- [ ] Write failing audit tests and implement exact-once event linkage to confirmed edits; preserve original sender/date.
- [ ] Browser-test each form using only local routes/mock Cloud transport and TOTO-shaped 6-button/18-row fixture. Check Tracking -> form -> edited values -> Cloud revision -> Tracking, locked job, concurrent IT close and failures. No real production mutations.
- [ ] Run `node --test tests/*.test.cjs` and browser script; all must pass. Request read-only whole-change review and fix concrete safety findings.
- [ ] Report results and remaining auth limitation. Deploy frontend and Sync Worker only after deploy authorization; back up Cloud and verify deployed hashes/API behavior without creating test campaigns in production.

## Execution handoff

Recommend Native execution: form adapters and Cloud revision share identities and validation tightly, so one implementer with a final independent review minimizes mismatched assumptions. Await plan review and execution-method selection before implementation per writing-plans workflow.
