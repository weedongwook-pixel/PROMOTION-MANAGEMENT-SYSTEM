# Email session authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep ordinary Microsoft login and Gmail delivery while removing the separate custom email API consent requirement.

**Architecture:** Exchange a fresh, browser-bound Microsoft ID token once for an opaque server session. Protected immutable-ID grants remain authoritative; mutations require Origin and CSRF checks. Preserve the existing two-milestone CoPro/outbox workflow.

**Tech Stack:** Cloudflare Workers/D1, Web Crypto, existing MSAL Browser, vanilla JavaScript, Node tests and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-email-session-auth-design.md`

## Global Constraints

- Existing tenant `512d498e-05ac-402b-a2aa-d61d10c3bee8`; staff client `8c0e2312-d9ae-4dff-accb-65fa3cb9815e`.
- Gmail sender remains `it@rocks-foods.com`; no Entra changes, automatic grants, real sign-in, consent or delivery during implementation.
- Challenge lifetime five minutes; session lifetime at most 60 minutes and never beyond ID-token expiry; no sliding extension.
- Challenge/exchange limit 20 attempts per trusted source per five minutes; JSON body <=32KiB and ID token <=16KiB.
- Cookies: `__Host-pc_email_preauth` and `__Host-pc_email_auth`, Secure, HttpOnly, SameSite=Strict, Path=/; separate existing Google callback cookie remains Lax.
- Keep every email activation flag false. Preserve secrets and existing data; deployment/migration/activation require separate authorization.
- Preserve dirty in-place workspace. Record scoped diffs and test evidence instead of committing unrelated/untracked deployed baseline.

## Review Focus

- A second tab switches website accounts while an older email session remains: reject mismatched actor, preserve form, require explicit verification (Task 4).
- Duplicate exchanges or oversized chunked requests: only one session, bounded reads before verification (Task 2).
- Logout or grant revocation during Google consent: callback cannot connect a mailbox (Task 3).
- Offline logout or cancelled popup: normal login/logout and campaign data remain usable (Task 4).
- Browser-supplied IP or old Authorization token: cannot evade authentication, limits or grant checks (Tasks 2–3).

## File map

- Create `sync-worker/migrations/005_email_sessions.sql`: additive protected auth storage and Google-attempt session link (confirm existing migration directory before creating).
- Create `sync-worker/email/session-store.js`: atomic challenge/session/rate-limit persistence and bounded cleanup.
- Create `sync-worker/email/session-auth.js`: token exchange, cookie parsing, session and CSRF validation.
- Create `sync-worker/email/session-router.js`: dedicated auth endpoints.
- Modify `sync-worker/email/identity.js`, `config.js`, `router.js`, `oauth.js`: protected actor integration/configuration and Google callback binding.
- Modify `js/email-auth.js`, `js/email-settings.js`, `js/copro-email-client.js`, `Potato Corner Promotion System.html`: explicit verification, cookie requests, in-memory CSRF, safe logout.
- Modify existing email fixtures/browser scripts, `pages/Email_Settings.html` only where state/copy requires, and `docs/gmail-connection-setup.md`.

### Task 1: Protected persistence

**Interfaces:** `createChallenge(db, input)`, `consumeChallengeAndCreateSession(db, input)`, `getSession(db, hash, now)`, `revokeSession(db, hash, now)`, `consumeAuthRateLimit(db, sourceHash, now)`, `cleanupAuthRows(db, now)` exported by session-store. Inputs use verified hashes and epoch milliseconds, never browser roles; consume returns `{created:boolean}` and limits `{allowed:boolean,retryAfter:number}`.

- [ ] Write `tests/email-session-storage.test.cjs` using the existing SQLite-backed D1 adapter: migration preserves existing rows; replay/race creates exactly one session; replacement revokes old session atomically; 21st attempt in one window denied; next window allowed; cleanup bounded and expired session denied.
- [ ] Run `node --test tests/email-session-storage.test.cjs`; require intended missing-module/schema failures.
- [ ] Implement migration and functions with parameterized SQL, indexed timestamps, guarded D1 batches and maximum 100 expired rows per table per cleanup. Add nullable `auth_session_hash` to Google attempts; invalidate only pending unbound attempts, preserve connections.
- [ ] Run storage tests to PASS; inspect scoped diff and record evidence without mixed commits.

### Task 2: Nonce-bound authentication endpoints

**Interfaces:** `verifyStaffIdToken(token, env, {nonceHash, now}) -> {tenantId,objectId,expiresAt}`; `resolveEmailSession(request, env) -> {tenantId,objectId,sessionHash,csrfToken,expiresAt}`; `requireEmailCsrf(request, session, env) -> void`; `handleEmailSessionRoute(request, env) -> Response|null`. Errors use controlled status/code, never token material.

- [ ] Write `tests/email-session-auth.test.cjs`: locally RSA-signed valid token plus mocked JWKS; wrong nonce/audience/tenant/issuer/key/algorithm/version/OID/signature, expired/future claims, replay and binding mismatch all denied. Cached token for another nonce fails. ID tokens/access tokens as ordinary bearer credentials fail.
- [ ] Add endpoint assertions: exact Origin; cookie attributes; 32KiB bounded streaming read and 16KiB token limit; missing trusted CF address fails closed; spoofed JSON/X-Forwarded-For ignored; atomic rate limit; no grant auto-created; GET returns only own identity/expiry/CSRF and no-store; logout idempotently clears/revokes.
- [ ] Run `node --test tests/email-session-auth.test.cjs` and confirm intended failures.
- [ ] Implement session-auth/router using Task 1 interfaces, random 32-byte values and SHA-256 hashes. Use existing encryption secret to HMAC trusted source keys. Reuse bounded tenant-pinned JWKS cryptography without retaining bearer fallback; reject token-supplied key URLs. Challenge response `{challengeId,nonce}`; session response `{tenantId,objectId,expiresAt,csrfToken}`.
- [ ] Run both new test files to PASS; inspect scoped diff and record evidence.

### Task 3: Replace protected email authorization and bind Gmail consent

**Interfaces:** Preserve existing `verifyEmailActor` return shape for downstream grant checks; derive actor from `resolveEmailSession`. Keep existing admin/submit/IT checks in transactions and dispatcher. Attach originating session hash to new Google attempts.

- [ ] Extend `tests/email-connection-router.test.cjs`, `tests/email-connection-oauth.test.cjs`, `tests/copro-email-identity.test.cjs`: session without grant denied; live grant revocation denied; every email mutation missing/wrong CSRF or Origin denied; old bearer/shared-sync credentials never fallback; Google callback rejects revoked/expired originating session both before state consumption and credential update. Existing connection preserved.
- [ ] Add readiness assertions: tenant/staff-client required, custom audience/scope absent; all flags false remains disabled. Auth bootstrap endpoints must be reachable for explicit verification when connection readiness otherwise permits it, without exposing mailbox routes.
- [ ] Run affected tests and confirm failures before implementation.
- [ ] Integrate auth routes ahead of mailbox/admin gates, replace custom bearer actor resolution, apply mutation CSRF boundary and preserve Google callback exception with its separate state/browser binding. Update config to `EMAIL_STAFF_CLIENT_ID`; do not alter normal non-email authorization.
- [ ] Update existing fixtures to genuine server sessions rather than bypassing identity/grants. Run `node --test tests/*.test.cjs` to PASS; record evidence.

### Task 4: Explicit frontend verification and safe account lifecycle

**Interfaces:** `PC_EmailAuth.verify() -> Promise<session>` explicitly opens popup; `getSession() -> Promise<session>` rehydrates without popup; `requestHeaders(method) -> Promise<object>` supplies CSRF only for mutations; `logout() -> Promise<void>` revokes/clears in-memory state. Preserve compatible callers only where semantics remain secure.

- [ ] Extend `tests/email-connection-ui.test.cjs` and browser scripts: only explicit verification requests `openid/profile` with server nonce; no `access_as_user`; no popup at boot/save/poll; cancellation keeps form; reload rehydrates CSRF; selected-account mismatch blocks pilot; offline logout still clears ordinary website state. Server grants—not browser Admin label—decide access.
- [ ] Run UI tests to confirm intended failures.
- [ ] Replace access-token acquisition with challenge/popup/exchange and in-memory CSRF. Update both clients to same-origin credentials with no Authorization header; settings show verify/expiry/enrollment identity in TH/EN. Integrate best-effort keepalive website logout without blocking ordinary logout or saving.
- [ ] Update browser harnesses to emulate fresh nonce exchange, real protected sessions and CSRF while retaining business transaction checks. Run existing email connection and two-button CoPro browser scripts at desktop/mobile sizes; inspect one bounded TH/EN settings pass.
- [ ] Run full Node suite to PASS; record scoped changes and screenshots, no provider tokens or personal mailbox data in artifacts.

### Task 5: Release verification and operator handoff

**Interfaces:** Existing deployment remains disabled; operator runbook describes config, verified-ID bootstrap, owner consent and separately approved test activation.

- [ ] Update `docs/gmail-connection-setup.md`: no extra Microsoft custom scope; existing-app sign-in can still be company-policy constrained; immutable verified tenant/OID bootstrap only; exact Google callback remains unchanged; never paste secrets in chat. Document session expiry/re-verification, rollback and separate migration/deploy/send approvals.
- [ ] Run `node --test tests/*.test.cjs`, `scripts/test-email-connection-browser.cjs`, and `scripts/test-copro-email-browser.cjs` with established local Playwright/Chrome configuration; require all assertions pass. Repeat normal login/form regression harnesses documented in existing progress ledger.
- [ ] Run frontend and backend Wrangler dry-runs using their respective configs; confirm asset exclusions, service binding, no custom-scope readiness and all source activation flags false. No remote migration or deploy in this task.
- [ ] Request one focused fresh security review for the complete auth change: token audience/nonce, replay/race, CSRF, account drift, callback/session revocation, bootstrap escalation and unchanged business/outbox authorization. Add failing regression and fix any Important/Critical finding.
- [ ] Hand off actual pass counts, remaining risks and disabled status. Ask separately for backup/additive migration/disabled deployment authorization. Do not claim mail connected or sent before live evidence.

## Self-review

All spec sections map to Tasks 1–5: persistent bounds/races (1), cryptographic/session/CSRF boundaries (2), current grants/callback/configuration (3), explicit UI/account lifecycle (4), preservation/verification/rollout (5). Review Focus cases have owning tests. Existing business functions retain their interfaces; new session interfaces are defined before consumers. The plan does not authorize external state changes or merge unrelated user work.
