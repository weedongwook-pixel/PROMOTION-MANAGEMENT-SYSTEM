# Gmail Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline. Do not delegate implementation unless explicitly requested. Steps use checkbox syntax. Await approval of this plan before product-code changes.

**Goal:** Add a secure administrator-only Gmail connection page for `it@rocks-foods.com`, without sending messages or changing campaign saving.

**Architecture:** Isolated email identity, readiness, encrypted-storage and OAuth modules extend the existing Cloudflare sync Worker. A small TH/EN settings page acquires a dedicated Microsoft API token, then initiates Gmail owner consent. Live routes fail closed until identity configuration, protected grants, secrets and feature enablement are present.

**Tech Stack:** Cloudflare Workers/D1, Web Crypto, existing MSAL Browser, Google OAuth/Gmail API, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-gmail-connection-design.md` (user approved proceeding on 2026-10-19).

## Global constraints

- Sender `it@rocks-foods.com`; public OAuth client ID `626917153875-bsnv8et0f8eav1nf91u7ttl03gdhaaus.apps.googleusercontent.com`.
- Gmail connection only: no sending endpoint, scheduler, mailbox search, recipient configuration, form bindings or historical-mail processing.
- Administrator authorization is distinct from Gmail owner consent. Never accept localStorage roles, a Graph token, the shared sync bearer, or a client-supplied user name as email authorization.
- Protect tokens, grants and OAuth attempts in dedicated server storage, excluded from generic store APIs and browser exports.
- No real credentials in tests, no client secret in chat, source, frontend, logs or screenshots.
- No production migration, deployment, consent or message send as an implicit implementation step. Supply the exact callback only after its implementation, tests and approved disabled rollout.
- Preserve the dirty working tree and current deployed behavior. Do not stage mixed existing files or create a misleading whole-file commit. Record scoped progress in `.superpowers/sdd/2026-10-19-gmail-connection/progress.md`.
- Runtime configuration can remain incomplete during mocked development. It must block live use, not be bypassed. Existing campaign saving must continue independently.

## Review focus

1. Wrong Microsoft account cached in a popup: bind requests to the selected verified tenant/object ID, not whichever display name the website shows.
2. A copied callback URL or replay from another browser: require both single-use state and the initiating browser session.
3. Consent returns the wrong Google mailbox or fewer scopes: do not persist a usable connection or show connected.
4. A delayed callback arrives after disconnect: it must not reconnect a deliberately disconnected mailbox.
5. Global store export, logs, browser history or frontend error messages: must not expose credentials, authorization codes, or grants.

## File map and common contracts

- Create `sync-worker/email/config.js`: immutable defaults and deployment readiness. `readEmailConfig(env) -> Config`; `emailReadiness(config) -> {ready, missing:string[]}`. Missing identifiers refer to configuration names, never their values.
- Create `sync-worker/email/identity.js`: `verifyEmailAdmin(request, env, deps={}) -> Promise<{tenantId,objectId}>`. Protected D1 grant lookup only after token verification.
- Create `sync-worker/email/storage.js`: protected grants, attempts and connection persistence, AES-GCM helpers.
- Create `sync-worker/email/oauth.js`: begin/callback/disconnect/account refresh lifecycle, injected provider HTTP for isolated tests.
- Create `sync-worker/email/router.js`: `routeEmail(request,env) -> Promise<Response|null>`; explicit origin policy and secret-safe error translation.
- Create `sync-worker/migrations/003_email_connection.sql`: current repository has migrations001/002 only; check again before implementation and resolve any competing003 without overwriting it.
- Modify `sync-worker/worker.js`: call the email router before existing shared-bearer gate, never change authorization of existing routes.
- Modify `src/worker.js`: same-origin forwarding of `/email/` only to the fixed sync Worker; all other requests retain existing asset behavior. Never add the shared sync bearer, accept an arbitrary upstream, or log callback query values.
- Modify `sync-worker/wrangler.toml`: disabled non-secret defaults only; no plaintext secrets or grant IDs.
- Create `pages/Email_Settings.html`, `js/email-settings.js`: connection-only UI.
- Modify `Potato Corner Promotion System.html`: navigation and an explicit email-specific token acquisition wrapper, isolated from the existing login.
- Modify `tests/helpers/sync-worker-source.cjs` only to include new imports for isolated Worker tests.
- Create focused test files named in the tasks below, a mocked browser harness, and a deployment runbook. No campaign form files need changes.

Shared defaults: feature flag `EMAIL_CONNECTION_ENABLED=false`; `EMAIL_SENDING_ENABLED` is not implemented and UI always reports sending disabled. Production origin `https://white-pine-853e.quiet-surf-dda2.workers.dev`. Proposed callback path `/email/gmail/callback`. Gmail scopes are exactly `gmail.readonly` and `gmail.send` full Google scope URLs. Allow no arbitrary callback or return URLs from clients.

## Task 1: Fail-closed identity, configuration and dedicated schema

**Interfaces:** Produces Config/readiness and `verifyEmailAdmin`; later tasks consume verified `{tenantId,objectId}`. The candidate tenant and Entra registrations are recorded in the approved spec, not treated as confirmed grants.

- [ ] Create `tests/email-connection-identity.test.cjs` with locally signed RSA test tokens and injected fixed-host JWKS fetch: shared-sync token, browser role, missing bearer, wrong issuer/audience/tenant, expired token, wrong algorithm, unknown staff and revoked grant reject. A valid scoped token with a protected active administrator grant succeeds. Assert wrong cached account fails even when its display name matches.
- [ ] Run `node --test tests/email-connection-identity.test.cjs`; observe RED from missing implementation, not a fixture error.
- [ ] Implement `config.js`, `identity.js` and the migration. Pin RS256 and the configured tenant's discovery/JWKS hosts; validate signature, token version, exact issuer/audience, `tid`, `oid`, required `scp`, `exp` and `nbf` with at most60seconds skew. Use bounded JWKS caching and one refresh for an unknown key; never honor token-supplied key URLs. Require a protected active administrator grant keyed by tenant/object ID. Missing identity configuration fails closed; no Graph-token fallback.
- [ ] Schema: `email_admin_grants(tenant_id,object_id,enabled,created_at, PRIMARY KEY(tenant_id,object_id))`; `email_oauth_attempts(state_hash PRIMARY KEY,tenant_id,object_id,session_hash,verifier_cipher,expires_at,generation,consumed_at)`; `email_connections(id PRIMARY KEY CHECK(id=1),sender,status,refresh_cipher,granted_scopes,connected_at,updated_at,generation)`. No insertion of a real administrator grant during tests or implementation.
- [ ] Add `tests/email-connection-storage.test.cjs`: migration applies to an isolated snapshot of existing001/002schema, existing campaign rows remain byte-identical, and generic store enumeration includes none of the new records.
- [ ] Run both suites GREEN, record changed files/results in the ledger. Do not apply migration remotely.

## Task 2: Credential encryption and Google protocol

**Interfaces:** `encryptSecret(value:string,key:string,aad:string) -> Promise<string>` and `decryptSecret(...) -> Promise<string>` in storage; `exchangeCode(code,verifier,config,deps)`, `refreshAccessToken(connection,config,deps)`, `verifySender(accessToken,config,deps)` in OAuth. No helper returns credentials to browser code.

- [ ] Write `tests/email-connection-oauth.test.cjs`: randomized AES-GCM IVs, versioned ciphertext, wrong key/AAD/tampering rejection, mocked Google token errors, refresh without a new refresh token retains the old one, missing requested scopes rejects, wrong account rejects. Sender verification uses Gmail profile `emailAddress` and exact case-normalized expected sender, not OAuth `login_hint` alone.
- [ ] Run the suite RED.
- [ ] Implement AES-GCM with an independent base64-encoded32byte Worker secret key, random12byte IV, and AAD binding the record purpose/identity. Use encrypted PKCE verifiers and refresh tokens. Normalize Google protocol failures into fixed error codes; never stringify provider responses into browser errors/logs.
- [ ] Implement token exchange and refresh via HTTPS allowlisted Google endpoints. Gmail profile verification uses the authorized access token. Require offline consent and retain refresh credentials only on the server. HTTP calls have bounded timeouts and injected mocks in tests.
- [ ] Run identity/storage/OAuth suites GREEN; record results without credential values.

## Task 3: Session-bound consent routes and disconnect

**Interfaces:** `GET /email/capabilities -> {enabled:false|true,sendingEnabled:false,scope:string|null}` contains no account/grant/secret values. Protected `GET /email/status -> {state,sender|null,missing:string[],sendingEnabled:false}`; `POST /email/gmail/connect -> {authorizationUrl}`; `POST /email/gmail/disconnect -> {state:'disconnected'}`. `GET /email/gmail/callback` consumes Google response and returns a fixed, minimal result page.

- [ ] Write `tests/email-connection-router.test.cjs`: untrusted origins and shared-token bypass reject; configuration-disabled routes never call Google; duplicate callback, expired10minute attempt, wrong browser session and wrong mailbox reject; disconnect increments generation and invalidates pending attempts; a delayed callback cannot persist credentials. A callback cannot choose an arbitrary frontend return URL.
- [ ] Run router tests RED.
- [ ] Implement begin consent with cryptographic256bit state, S256 PKCE and a cryptographic browser-session cookie. Persist only state/session hashes, encrypted verifier and administrator identity. Cookie is HttpOnly/Secure/SameSite=Lax scoped to `/email/`; callback must match the initiating cookie and one-time attempt. Browser requests and the proposed callback use the frontend's `/email/` prefix, forwarded by `src/worker.js` to the fixed sync origin, avoiding cross-site cookie dependencies. Preserve bearer/Origin/cookie and response Set-Cookie headers; never inject shared synchronization credentials. Test non-email asset responses remain unchanged and arbitrary upstream selection is impossible.
- [ ] Atomically consume state and guard connection persistence by generation. Verify Google identity/scopes before writing usable credentials. Concurrent callbacks and disconnect fail safely. If provider exchange succeeds but guarded persistence loses a race, discard credentials and report reconnect required, never connected.
- [ ] Callback response uses `Cache-Control:no-store`, `Referrer-Policy:no-referrer`, restrictive CSP and no third-party resources. Send only a fixed success/error status to the exact allowed opener origin, or instruct the user to close the result page; no authorization code/token in message data.
- [ ] Add optional revoke action to disconnect: clear local credentials and cancel attempts regardless of provider revocation availability, and accurately report whether owner-side revocation is still needed. Do not claim a token is revoked merely because the local connection was removed.
- [ ] Hook router before legacy authorization; keep legacy CORS/routes unchanged and give email routes their own strict CORS policy. Return null for non-email routes.
- [ ] Run all email and existing Worker suites GREEN; record checkpoint.

## Task 4: Administrator settings UI and dedicated MSAL token request

**Interfaces:** `window.PC_EmailAuth.acquireToken({interactive:boolean}) -> Promise<string>` requests only the configured email API scope using an explicitly selected MSAL account. `window.PC_EmailSettings.mount(root)` renders the states from Task3 and never stores tokens in localStorage.

- [ ] Write `scripts/test-email-connection-browser.cjs` with mocked Microsoft/Google HTTP and isolated D1. Assert disabled/missing configuration is clear; ordinary website login never requests the email scope; wrong cached account cannot connect; explicit interaction may request consent; canceled consent leaves the promotion session/form intact; reload/open does not start consent automatically.
- [ ] Run browser harness RED.
- [ ] Implement `Email_Settings.html` and `email-settings.js` using existing theme, proper labels/focus and data-th/data-en. Header states sending disabled. Hide/disable connect until readiness and verified admin access succeed; never infer connected from a local flag. Disconnect requires explicit confirmation and refreshes server status.
- [ ] Add navigation for appropriate existing administrator roles as a discoverability feature only. No server trust in that visibility. Export MSAL email acquisition without changing `loginWithMicrosoft()` scopes, current redirect URI or campaign login behavior. Missing/admin-denied email consent yields an email setup message, not website logout or repeated popups.
- [ ] Test popup callback provenance (origin and source), blocked popup recovery and mobile/no-opener fallback. Never show arbitrary callback query text as HTML.
- [ ] Run browser harness at1366px and390px; inspect both screenshots in one batch, fix evidenced defects once, confirm. Run existing Microsoft popup/login tests and Proposal/Coupon revision browser workflows. Record checkpoint.

## Task 5: Configuration handoff and release gate

**Files:** Create `docs/gmail-connection-setup.md`; update `docs/superpowers/plans/2026-10-18-email-connection-readiness.md` with actual evidence, not assumed configuration.

- [ ] Document missing live settings: confirmed Entra audience/scope/token version and administrator object ID, sender Workspace membership/owner approval, Google client secret, encryption key, exact callback after implementation, and disabled feature flag. Supply secure secret-entry commands with no sample real values, no secrets on command-line arguments, and no instructions to paste secrets into chat.
- [ ] Explain Internal audience governs who can authorize the connection, not the message recipient domain. Do not promise compatibility without actual account consent.
- [ ] Run `node --test tests/*.test.cjs`; require all suites GREEN. Run new mocked browser harness and existing login/form checks. Dry-run backend/frontend bundles; verify `.assetsignore` excludes any credential artifacts, SQL, documentation and tests as appropriate.
- [ ] Perform one bounded security review covering the five Review Focus cases, auth bypasses, generic store secret exposure, callback replay, disconnect races, logs, CORS/cookies and no accidental sending routes. Fix only concrete findings in scope and rerun affected/full tests.
- [ ] Hand off implemented-but-disabled result, tests and exact remaining configuration. Ask separately before production D1 export/migration/deploy or live account consent. Do not send any mail in this slice. Future internal test sends require explicit recipients and content under the later campaign-mail plan.

## Approval and execution

Recommended execution is **Native / inline**: the identity/OAuth/UI contracts are sequential, and one implementer can keep the security boundary consistent while preserving this dirty deployed checkout. No subagent implementation is requested.

Approve this plan before code changes. Live configuration gaps block activation, not isolated mocked development. Deployment and real sending remain separate approval boundaries.
