# Email authorization using existing Microsoft sign-in

Date: 2026-10-19, Asia/Bangkok. Status: proposed written design; awaiting user review. The user approved the approach of preserving existing Microsoft login and removing the extra email API permission. That approval permits this design, not implementation, migration, grants, activation or email delivery.

## Outcome and boundaries

Staff keep the existing Microsoft account and promotion website login. Email features no longer request the separate `access_as_user` scope, email API audience, API registration or tenant-wide admin consent for that custom scope. A nonce-bound sign-in with the existing staff application establishes a separate, server-verified email session. Gmail remains the only sender, `it@rocks-foods.com`.

This does not remove Microsoft authentication altogether, change company policy, promise to bypass Conditional Access, or turn the browser's role label into authorization. It does not migrate ordinary password accounts to a new authentication system. Existing normal login and campaign saving continue independently of email setup or email-session failures.

The two Co-Promotion milestones, approved test conversations, explicit To/CC confirmation, protected campaign ownership/button identities, business transactions and durable outbox remain unchanged. There are still only two ordinary replies: initial saved Co-Promotion and one combined all-buttons IT-plus-Interface completion. No historical adoption, automatic revision resend or real partner send is introduced.

## Existing evidence and selected approach

The current staff app is `8c0e2312-d9ae-4dff-accb-65fa3cb9815e`, with tenant `512d498e-05ac-402b-a2aa-d61d10c3bee8`. The existing shell uses MSAL Browser and its registered frontend origin redirect. Its current browser-side account/role matching is not a server authentication boundary. Protected email grant tables already use immutable `(tenant_id, object_id)` identities.

Selected: use the existing staff app's freshly issued ID token once at a dedicated session-establishment endpoint, then opaque HttpOnly session cookies for email commands. Do not accept that ID token as an API bearer token on ordinary email routes. Do not accept old custom-API access tokens, Graph tokens, shared sync credentials or unsigned browser identity objects as fallback credentials.

Rejected alternatives: weakening the existing API token checks would remove authorization rather than replace it. A Google-only identity or separate password/OTP system would introduce new staff accounts, recovery and enrollment concerns that the user did not choose.

Microsoft documents ID-token audience, issuer/signature and nonce validation in [ID tokens](https://learn.microsoft.com/en-us/entra/identity-platform/id-tokens) and [claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference). MSAL's [PopupRequest](https://learn.microsoft.com/en-us/javascript/api/@azure/msal-browser/popuprequest?view=msal-js-latest) supports a supplied nonce. These references do not establish the real tenant's consent or Conditional Access configuration; live sign-in must still be tested with an authorized user.

## Session establishment

1. The user explicitly selects Verify Microsoft in Email Settings or enables the email pilot. No provider popup appears at boot, on ordinary saves or in background polling.
2. `POST /email/auth/challenge`, exact frontend Origin only, issues a cryptographically random nonce and challenge ID valid for five minutes. A separate random pre-auth browser binding is set as `__Host-pc_email_preauth` with Secure, HttpOnly, SameSite=Strict, Path=/ and Max-Age=300. Store hashes of the binding and nonce in the dedicated challenge table, not plaintext reusable credentials.
3. The frontend uses its existing MSAL instance and registered redirect, with `loginPopup({scopes:['openid','profile'], nonce, ...})`. MSAL supplies protocol state and PKCE. Request no custom API, Graph mail or Gmail scopes in this step. A popup/account mismatch is surfaced without logging the website user out or discarding their form.
4. `POST /email/auth/session` submits the challenge ID and returned raw ID token once, in a size-limited JSON body. Origin and pre-auth cookie must match before token verification. No token is put in a URL, localStorage, logs or error response.
5. The server verifies RS256, bounded allowed header fields, the tenant-pinned Microsoft signing keys, the existing staff client ID as `aud`, exact tenant/v2 issuer, `tid`, GUID `oid`, `ver=2.0`, expiry/not-before/issued-at and the server-issued nonce. Ignore any token-provided key URL; bound key refresh/cache and network timeouts. Reject wrong app/tenant/key/algorithm, stale or future claims, malformed token, wrong nonce/browser and consumed/expired challenges. A valid ID token is authentication, not a role grant.
6. Atomically consume the unconsumed challenge with its expected hashes/expiry and create the session. A raced/replayed exchange must not create another session. Revoke the previous email session represented by this browser cookie during account replacement. Clear the pre-auth cookie.
7. Generate a new random 32-byte opaque session value. Store only its hash with verified tenant/OID, issue/expiry/revocation metadata and a separate random CSRF token. The CSRF value is stored only in the protected session table and returned to the authenticated frontend; it is not sufficient to authenticate without the cookie. Set the opaque value as `__Host-pc_email_auth`, Secure, HttpOnly, SameSite=Strict, Path=/, Max-Age no later than the token expiry. Absolute session lifetime is at most 60 minutes and never beyond the ID token's expiry; no silent extension or permanent remember-me session.

Any old cached ID token with a different nonce is rejected. The first implementation uses an explicit fresh popup rather than weakening nonce validation to accept a cached token. An existing Microsoft SSO session can reduce what Microsoft asks the user to enter, but seamless/no-prompt login is not guaranteed.

## Authorization, CSRF and identity selection

`verifyEmailActor` resolves the opaque cookie against unexpired, unrevoked dedicated sessions and returns only the verified tenant/OID. Existing protected administrator and `manage`/`submit`/`it` grants remain authoritative and are checked on every relevant action, including inside guarded transactions. Revoking a grant takes effect without waiting for session expiry. Ownership rules, immutable IDs and dispatcher permission checks remain in force.

The frontend compares the server-reported tenant/OID with the Microsoft account chosen for the current website login. Those browser values can prevent accidental account mixups but never grant a server permission. If the server session belongs to another selected account, block pilot operations and require explicit re-verification; do not silently attach an old user's session to a new user's form.

Every state-changing email command requires the exact allowed Origin and `X-PC-Email-CSRF` matching the current session. Challenge/exchange endpoints are protected by Origin plus browser-bound, single-use nonce handling instead. `POST /email/auth/logout` is idempotent, Origin-checked, revokes the current session and clears its cookie; logging a session out grants no privilege and must remain possible after a grant is revoked. A strict SameSite cookie is not used as the only CSRF defense for business actions.

`GET /email/auth/session` returns only verified identity, expiry and the session's CSRF token; no raw cookie/ID token. It is no-store, never wildcard-CORS, and only available to a valid same-origin browser session. The raw CSRF token stays in frontend memory; reload obtains it again from this endpoint. Expired or invalid cookies get a controlled401 and are cleared. A valid authenticated account with no email grant may see its own verified tenant/OID on this endpoint for administrator enrollment, but cannot view mailbox metadata, connect Gmail or mutate campaigns.

The website logout path attempts a same-origin keepalive logout request before clearing local state/reload, without making successful website logout depend on network availability. A failed network logout does not create a new cookie/session; absolute expiry and live grant revocation remain the safety bounds. Switching users requires replacing the email session, never trusting only localStorage changes. Sessions do not appear in generic store exports or service-worker caches.

## Protected storage and abuse bounds

Add migration `005_email_sessions.sql`; preserve all existing campaign, email, grant, connection and outbox data. Three additive tables:

- `email_auth_challenges`: random challenge identity, nonce/binding hashes, creation/expiry/consumption times.
- `email_auth_sessions`: session hash, verified tenant/OID, CSRF token, creation/expiry/revocation times.
- `email_auth_rate_limits`: bounded time-window counters keyed by a secret-keyed hash of the Cloudflare-provided client IP, not raw IP or user-supplied identity.

Also add nullable `auth_session_hash` to `email_oauth_attempts` to bind newly started Google consent to its originating staff session. Existing pending attempts with no originating session binding are invalidated rather than adopted. Callback consumption and connection update must both guard that linked session's expiry/revocation and the current administrator grant. Existing connected Gmail credentials are preserved; this is not a forced disconnect or key rotation.

Challenge/exchange limits: 20 attempts per source per five-minute window; exchange also limited by single challenge consumption. Rate-limit checks/increments must be atomic. The trusted network address must come from Cloudflare's request boundary, never a browser-submitted JSON field or X-Forwarded-For. Missing trusted address fails closed on production authentication endpoints. Keep expired-window/challenge/session cleanup bounded and indexed; do not scan all sessions on each request. Request body <=32KiB; ID token <=16KiB. Sanitize errors and avoid credentials/query strings in diagnostics.

Bootstrap is explicit: an infrastructure administrator inserts initial email grants for a verified tenant/OID after checking the intended account. The website must not auto-promote the first person who signs in, infer grants from email strings/display names, copy browser roles or import mutable synchronized user records. No new grant-management UI, self-grant endpoint or requirement for a company-wide Microsoft admin role is introduced by this change. Remaining bootstrap identity/approval is a rollout prerequisite, not guessed from the screenshots.

## Frontend and backend interfaces

Replace email access-token acquisition in `js/email-auth.js` with explicit verify/session/CSRF/logout helpers. Update Email Settings and CoPro clients to use credentials=same-origin plus CSRF for mutations, rather than Authorization headers. Keep existing user-facing theme, language choices, form contents and failure recovery.

The same-origin frontend `EMAIL_BACKEND` service binding remains mandatory. Cookies, Origin and CSRF headers must survive this boundary unchanged. `/email/*` remains Worker-first/no-store and bypasses the service worker. The Gmail OAuth browser-binding cookie remains separate from the staff authentication cookie, so Google's cross-site callback does not require sending the Strict staff-session cookie. Callback authorization still checks its single-use Google state, owner identity and current protected administrator grant; expiry/revocation of the originating staff session must also invalidate an unfinished Gmail consent attempt.

Retain the old API-token verifier only as a reusable internal cryptographic helper if needed by tests, not as a public authentication fallback. Unknown or old Authorization credentials cannot revive email access when a session is missing. Other existing non-email routes continue using their unchanged authorization model.

## Configuration and staged rollout

Required Microsoft non-secrets become `EMAIL_TENANT_ID` and `EMAIL_STAFF_CLIENT_ID` for the existing tenant/staff app. Remove custom `EMAIL_API_AUDIENCE`/`EMAIL_API_SCOPE` from readiness and client behavior; do not delete or change either Entra app or its permissions. Reuse Google client secret and encryption key already configured on Cloudflare; never rotate or expose them for this work. Configuration must match the existing staff app shown in source/screenshots, not silently accept arbitrary tenants or Graph audiences.

Keep connection/pilot/test-send/production-send switches false during development and disabled deployment. Confirm tests and backup before separately authorized migration/deploy. Old email bearer clients fail closed, while ordinary Microsoft login and promotion saving remain usable. No automatic role grants, real Microsoft sign-in, Google consent, schedule activation or test send is authorized by approving this spec.

After an approved disabled rollout: configure the known staff tenant/client IDs, explicitly bootstrap the authorized account's immutable-ID grants, enable connection only, verify the staff session through the normal Microsoft app, let the mailbox owner connect Gmail, approve the separate test loop/recipients, and only then separately authorize pilot/dispatcher activation. Existing Microsoft permissions/consent are not modified. A company policy denying even existing-app sign-in remains a real blocker, not a reason to weaken validation.

Rollback disables email switches and revokes new sessions/challenges; retain additive tables for audit. Do not revert unrelated login code, delete campaign data, remove old Entra apps, disconnect Gmail or rotate encryption keys automatically. Already queued events are not blindly requeued during auth migration; dispatcher continues to require current protected owner grants.

## Verification and review acceptance

Cryptographic tests use real locally signed tokens with mocked provider key transport: valid current nonce, wrong nonce/app/tenant/key/signature/algorithm, expired/future token, malformed claims, old access token and replay. Session tests cover challenge/browser binding, atomic races, expiration, logout/account replacement, revoked grants, CSRF/Origin failures, no first-user promotion, request/rate limits, missing trusted address and bounded cleanup. Do not mock away role checks or D1 transaction behavior.

Integration/browser tests cover the service binding, no custom scope request, explicit-only popup, cancellation preserving form data, unknown accounts denied email access, ordinary login unchanged, reload/session rehydration, account mismatch and logout. Repeat all existing protected business/outbox tests and the mocked two-button CoPro workflow. Verify the Gmail callback cannot finish after its originating email session is revoked. Inspect TH/EN desktop/mobile settings in a bounded pass without redesigning the page.

Run the full Node suite and frontend/backend dry-runs. One focused fresh security review before release should examine whether an unsigned/browser role can create a session, whether another app's ID token can be exchanged, CSRF/replay/account mixups and bootstrap escalation. Any concrete Important/Critical issue must have a failing regression and a verified fix. No real email or tenant mutations in tests.

## Self-review

This design replaces only the extra email API scope requirement with an explicit, nonce-bound authentication session. It does not claim that local login was already trustworthy. It preserves protected grants, Google OAuth and business/outbox rules; separates staff and Google callback cookies; rejects replay and account drift; and leaves deployment/activation/grant creation under separate approval. No production secrets or token values are included. The dirty existing workspace remains in place; do not commit mixed user changes or deploy as a side effect of design approval.
