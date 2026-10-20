# Authorized completion plan

User authorized completing and deploying all agreed work on 2026-10-20.

1. Reserve promotion and item codes atomically with every form's Cloud submission, including category-specific Item Set codes. Preserve existing code ownership and IT selection behavior.
2. Save incomplete CoPromo business fields to Cloud without submitting another campaign or queuing email. Expose My Pending Work, resume stable campaign/button identity using current Cloud fields, keep original email attachments. Explicit save and exit confirmation; no false success after Cloud failure.
3. Refresh unbound email source from current Cloud using stable row/button identifiers, reject replacement/deletion/membership changes, require fresh preview after any source edit. Keep bound/queued snapshots guarded.
4. Run unit/integration/browser tests (mock mail only), review changes, push GitHub and deploy backend then frontend. Do not send real emails during tests.

Ruling: no existing My Pending Work module was found; add a dedicated menu/page instead of repurposing the branch ticket queue. Drafts use the existing Cloud store authentication and compare-and-set versioning, scoped by the same application user identity used by submission history. Email authorization is still independently enforced before sending.

## Verification and rollout
- 317 automated tests pass; browser tests cover draft Cloud failure, save, reload, pending-list resume, legacy button selection, changed IT code, and normal CoPromo preview/queue. All email providers mocked; no real test email sent.
- Independent review corrected legacy button restoration and backend promotion-counter confirmation; scoped re-review found no blockers.
- Live category counter audit found absent 105/106/109 seeds. Applied the reviewed atomic initializer from scripts/category-counter-seed-sql.cjs using actual item-code fields (excluding coupon/phone numbers). Audited highwaters: 105=55, 106=124, 109=67. No existing reservations were removed.
- Backend deployed: 4267b232-886f-4aeb-8364-a497dbe8c25c.
