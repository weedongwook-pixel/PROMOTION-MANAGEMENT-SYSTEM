# Central sender with verified staff access

Approved scope: one server-managed Gmail sender (it@rocks-foods.com), employee access using either password or Microsoft website login, per-person audit. No extension of Gmail owner browser sessions.

## Identity and migration
- Preserve encrypted refresh token, provider refresh, thread binding, source verification and outbox idempotency.
- Use a shared mailbox workspace principal for existing campaigns. Carry an independently verified employee ID in every new audit/queued event. Never accept browser role/name as authorization.
- Staff records, password verifiers, Microsoft tenant/object IDs, sessions and grants live in protected D1 tables, outside generic promo_store.
- Existing public/browser password records are not migrated into privileged grants. Owner provisions private credentials or approves a verified pending Microsoft identity once. Pending identity claims are labels only; tenant/object ID identifies the account.
- Reuse the deployed Microsoft application's audience/tenant with a server-issued, browser-bound, one-use nonce. Verify issuer, signature, expiry, tenant, audience and nonce. No authorization from email addresses.
- Staff sessions last one workday (8 hours), HttpOnly/Secure/SameSite Strict. Logout, account disable and credential/grant updates revoke sessions. Employees reauthenticate to the website, never to the sender's Google account.
- Owner OAuth remains 1 hour for connection/account administration. Employee send/IT permissions do not allow mailbox disconnect, OAuth replacement or user administration.

## Implementation and checks
1. Add protected schema and staff identity/session routes; bounded login rate limiting and request sizes, salted password hashing, no credential logging.
2. Add per-person authorization to existing mailbox actor checks and transaction guards. Outbox checks initiator permission again immediately before provider submission. Preserve historical owner events.
3. Integrate both website login methods and in-flow staff reauthentication; no automatic Google popup for staff.
4. Add owner-only staff administration in Email Settings: provision/reset password accounts, approve Microsoft requests, grant send/IT, disable access.
5. Test forged identity, wrong token audience/tenant/nonce, replay, password failures, CSRF, revoked sessions, grant changes during queueing/dispatch; browser smoke with mocked provider.
6. Apply additive migration, deploy backend/frontend, verify deployed assets. Do not send real test email. Do not import default/passwords embedded in public code.

Operational setup remaining after deployment: the mailbox owner authorizes named staff once in Email Settings. No staff grants are inferred from localStorage or editable sync data.

## Verification and operations
- 373 automated checks passed, including employee audit, revocation at transaction commit and provider dispatch, Microsoft token verification/replay, legacy login failing closed on logout/network errors, and account-aware rate limiting.
- Desktop/mobile browser smoke covered owner provisioning and employee password sign-in against a mocked backend; no real email sent.
- Independent review findings (legacy fallback retaining an old session and office-IP throttling) were fixed and re-reviewed.
- Apply migration 007 before enabling EMAIL_STAFF_ENABLED. Keep the existing encrypted sender connection. Owner setup: Email Settings → verify mailbox owner → add staff credentials or approve a verified Microsoft request. Do not migrate public legacy credentials.
- Staff session lasts eight hours; re-login is to the website, not Google. Sender consent revocation still requires the owner to reconnect. Rotation of EMAIL_ENCRYPTION_KEY requires coordinated token re-encryption and staff password resets because password verifiers use a domain-separated pepper from this key.
