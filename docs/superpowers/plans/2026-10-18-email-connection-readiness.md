# Email connection readiness — 2026-10-18

## 2026-10-19 implementation update

Connection-only code and local mocked tests have been added under the approved 2026-10-19 plan. Source defaults keep `EMAIL_CONNECTION_ENABLED=false`; no live migration, deployment, secret update, owner consent or send has been performed. Earlier read-only remote findings below are historical, not a fresh remote inventory. See `docs/gmail-connection-setup.md` for remaining configuration and controlled rollout.

## Verified read-only findings

- Email spec and implementation plan exist; the user asked to resume implementation in this session.
- Current sync Worker: `potato-promo-sync`. Current source config has a D1 binding and no email/API identity configuration.
- `wrangler secret list --config sync-worker/wrangler.toml` returned only the secret name `SYNC_TOKEN`. No secret values were accessed. This checks this Worker, not all resources in the organization's Google or Microsoft accounts.
- The current Microsoft login requests Graph `User.Read`. The shell has an existing tenant and application ID, but these are not an API audience/scope configuration or proof of server-verified staff authorization.
- No email code, migrations, account connections, real messages, or deployment performed during this audit.

## Task 1 configuration gate

Status: prerequisite incomplete, not implemented. The plan explicitly requires stopping at this configuration gate if the API audience/scope and initial staff mappings are unavailable. Do not treat the shared sync token or browser role as sufficient authorization.

The owner/admin must supply or authorize configuration of:

1. Microsoft Entra API registration/scope for the email backend; confirmed issuer/tenant, audience, scope and permission grant for the frontend application. Do not reuse a Graph access token as an API access token.
2. Initial server-managed access mapping: verified Microsoft tenant/object IDs for the first Super Admin and authorized IT staff. Ordinary users receive assigned published threads only. Confirm a supported verified-login path for any local-only accounts before granting email access; do not silently equate a local display name with a Microsoft identity.
3. Google Cloud project with Gmail API enabled and OAuth consent configuration suitable for the organization's deployment.
4. Web OAuth client, approved redirect URI for the implemented callback, and account-owner consent for `it@rocks-foods.com`.
5. Private configuration supplied via Worker secret tooling, never passwords/client secrets/tokens pasted into chat or frontend files. Exact callback and secret setup commands are to be finalized with the implemented route; do not enter an unimplemented URL as if already working.

## Safe work after configuration confirmation

Implement and test the identity module first using local signed test tokens, then encrypted OAuth storage, registry, transactional outbox and optional UI. Keep live email disabled. A separate owner-approved internal test must precede any external-recipient sending.

## Operational safeguards

- Current website and campaign saving remain unchanged.
- No need to CC real partner threads or authorize mailbox reading during this prerequisite check.
- Account-owner participation, project configuration and identity verification must precede live connection; a Google sign-in alone cannot replace an OAuth client/consent setup.
- Before product-code implementation, obtain consent for an isolated worktree (or explicit in-place work) because the main checkout contains extensive uncommitted deployed work; do not copy only Git HEAD and assume it contains the current site.

## Official setup references

- Entra API scopes: https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-configure-app-expose-web-apis
- Gmail API setup: https://developers.google.com/workspace/gmail/api/quickstart/js
- Server-side Google OAuth: https://developers.google.com/identity/protocols/oauth2/web-server
