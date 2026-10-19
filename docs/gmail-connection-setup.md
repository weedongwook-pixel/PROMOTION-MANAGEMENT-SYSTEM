# Gmail connection setup — activation pending

The connection slice connects one sender, `it@rocks-foods.com`. The added Co-Promotion pilot implements approved-conversation selection and two queued replies, but is disabled by default. All development provider calls use mocks. No production migration, connection, consent or delivery is implied by this document.

## Where to open

After an approved deployment: website → ตั้งค่าระบบ / SYSTEM → ตั้งค่าอีเมล / EMAIL SETTINGS. Navigation is available to Admin/IT for discovery; only an active server-managed administrator grant permits connection. A website role alone grants no email access.

Existing Microsoft sessions created before this implementation must sign in through Microsoft again to establish the tenant/object account-selection binding. The API still verifies the access-token signature and protected grant on every authenticated request. This does not add any Gmail scopes to ordinary website login.

## Required administrator decisions and configuration

1. Confirm the mailbox owner authorizes connecting this account and it belongs to the Google Workspace organization containing project `potato-promotion-mail`. **Internal** controls which Google users can authorize, not which domains can receive future messages. Screenshots alone do not establish membership.
2. Confirm the existing staff client may request the email API's `access_as_user` delegated scope, with tenant administrator consent. Keep existing login permissions unchanged. Confirm the API emits **v2 access tokens**, with the API application's GUID as `aud`, configured tenant as `tid`, issuer `https://login.microsoftonline.com/<tenant>/v2.0`, and `access_as_user` in `scp`.
3. Configure non-secret `EMAIL_TENANT_ID`, `EMAIL_API_AUDIENCE` (API application GUID), and `EMAIL_API_SCOPE` (`api://<API application GUID>/access_as_user`) only after the Microsoft administrator confirms them. Do not substitute the staff client GUID or a Graph audience. Candidate registration IDs are in the approved spec; they are not proof of consent.
4. Obtain the intended administrator's tenant ID and immutable object ID from the Microsoft administrator. After migration approval, insert an enabled `email_admin_grants` row using those exact IDs. Never derive a grant from a display name, email address, role, or generic synchronized record. No real grant is included in the migration.
5. Set the Google client secret and independent 32-byte random encryption key as Worker secrets through local interactive prompts. Never send them in chat, screenshots, browser fields, command-line arguments or a publicly served file.

From the project directory, these commands prompt securely for their respective values:

```sh
npx wrangler secret put GMAIL_CLIENT_SECRET --config sync-worker/wrangler.toml
npx wrangler secret put EMAIL_ENCRYPTION_KEY --config sync-worker/wrangler.toml
```

The encryption key must be base64 encoding of 32 cryptographically random bytes, generated and transferred using an approved secret-management tool. Keep it independently of SYNC_TOKEN and the Google client secret. Rotation requires an explicit credential re-encryption or reconnect procedure; replacing the key alone will make old ciphertext unreadable.

## Controlled rollout (requires separate approval)

The frontend must declare the `EMAIL_BACKEND` service binding to `potato-promo-sync`, and route `/email/*` through its Worker first. Do not replace this with public `fetch()` to a same-account `workers.dev` URL: Cloudflare same-zone Worker-to-Worker requests require a service binding. The deployed smoke check must receive JSON200/no-store from `/email/capabilities`, not an HTML404.

- Export and verify a D1 backup before applying additive `003_email_connection.sql` remotely. No existing campaign rows should change.
- Deploy backend and frontend together, keeping `EMAIL_CONNECTION_ENABLED=false`. Preserve unrelated production Worker variables, including `CLOUD_FIRST_ENABLED` and existing secrets.
- Verify legacy login/forms and the public `/email/capabilities` report. Sending always remains false.
- Only after the deployed route and configuration are verified, register the exact implemented redirect: `https://white-pine-853e.quiet-surf-dda2.workers.dev/email/gmail/callback`. This is a deployment handoff value, not a claim the current live site implements it.
- Enable `EMAIL_CONNECTION_ENABLED=true` after the grant, consent, API settings and secrets are confirmed. Readiness rejects incomplete settings; protected routes additionally require the verified administrator grant.
- Sign in to the promotion website with Microsoft as that administrator. Open Email Settings, verify administrator permission if prompted, then explicitly press Connect Gmail. Allow popups. The mailbox owner selects `it@rocks-foods.com` and consents in Google's window.
- The result is connected only after successful token exchange, requested scopes, exact Gmail profile verification and a guarded server write. “Check again” validates the refresh credential/profile; definitive revocation requires reconnect, while a transient provider failure is reported as unavailable.
- Disconnect clears local encrypted credentials and invalidates pending attempts. It **does not revoke Google authorization**. The owner must remove access at Google Account → Connections. The UI links to that page.

## Failures and rollback

Do not weaken API audience/scope checks or grant shared-sync access when consent is missing. A denied email request must not log the user out or discard promotion drafts. Changing the feature flag back to false disables all live connection routes independently of campaign saving. Keep the additive tables for audit/recovery; do not drop them as a routine rollback. Do not log callback query strings, credentials, authorization headers or provider response bodies.

Known minor limitation from review: the callback result uses no-store/no-referrer/CSP and never echoes code/state, but the provider callback query remains in that popup's browser history. Its state is session-bound and single-use and code exchange uses PKCE. History cleanup is deferred; do not share callback URLs.

## Verification commands

```sh
node --test tests/*.test.cjs
node scripts/test-email-connection-browser.cjs
npx wrangler deploy --dry-run --config sync-worker/wrangler.toml
npx wrangler deploy --dry-run
```

The browser harness requires Playwright and Chrome and mocks both providers. No test sends mail. Initial live testing requires separate approval, a separate test conversation and explicitly confirmed recipients/content. Do not contact actual partners merely because the test Subject contains their name.

## Co-Promotion pilot — implementation and activation are separate

After backup and migration approval, apply additive `004_copro_email.sql` after `003_email_connection.sql`. No grant rows are seeded. An administrator must grant immutable Microsoft tenant/object IDs in `email_actor_permissions`:

| Permission | Purpose |
| --- | --- |
| `manage` | Search Gmail metadata, approve a concrete original message, recipients and permitted submitters |
| `submit` | Create new verified pilot submissions, preview/confirm their own Co-Promotion records |
| `it` | Commit verified IT settlement and Interface for protected pilot buttons |

An enabled `email_admin_grants` row implies `manage` only. Browser role labels, display names and shared-sync access do not grant these permissions. Use parameterized administrative SQL after verifying the IDs; never paste credentials into a query or chat.

Feature switches are all false in source control:

- `EMAIL_CONNECTION_ENABLED`: connection APIs and credential availability.
- `EMAIL_COPRO_ENABLED`: pilot business APIs and explicit per-tab opt-in.
- `EMAIL_TEST_SEND_ENABLED`: dispatcher may send to approved **test** recipients.
- `EMAIL_SEND_ENABLED`: dispatch only explicitly approved production conversations; test messages require the separate test switch.

A one-minute backend schedule is configured. It is inert while sending flags are disabled. After connection and recipient setup, enable only the required flags; preserve unrelated variables/secrets. The Worker scheduled handler processes at most five events per invocation. Do not expose an unauthenticated manual-dispatch endpoint.

### User test sequence

1. The owner connects Gmail `it@rocks-foods.com` using the connection process above. The original test conversation must be available in this mailbox, e.g. by including it in To/CC. Matching a Subject alone is not sufficient.
2. A manager opens Email Settings, searches `Test send to email copro UOB`, selects the exact message and approves explicitly entered To/CC and permitted Microsoft object IDs. Addresses must already be participants in that test message. External **test** addresses are permitted; arbitrary new recipients are not. This action sends nothing.
3. The submitter explicitly enables the pilot for this tab, then creates a **new** promotion. Its verified primary transaction creates stable campaign/button/row IDs. Existing campaigns are not adopted by name and historical jobs are not backfilled.
4. In the subsequent Co-Promotion form, select the approved conversation/month, complete the separate record for every button, enter exact approved To/CC, review the actual public email text and confirm. Accounting fields are preserved but internal remarks are excluded from email. Cancel leaves the original form intact and sends nothing.
5. A successful Co-Promotion transaction queues `submitted` once. The primary promotion save by itself does not send email. Queueing is not provider acceptance or delivery.
6. IT reloads the task from Cloud so its stable IDs are present. IT settlement saves normal names/type/product/Subset recipe/price-binding data and confirms existing owned Item Set reservations atomically with protected completion evidence. Interface may be saved first or last. Only after every active button has both verified milestones does one `it_interface_complete` event queue, with public promotion details.
7. Check campaign email history in Email Settings. `accepted` means Gmail accepted the request, not that recipients received or read it. The completion message cannot dispatch before the initial message is accepted.

Pilot boundaries: new submissions only; no automatic revision resend or historical recovery. Changing commercial details/cancelling/deleting queued work holds it. Released/unowned code reservations and duplicate/reused codes are rejected rather than guessed; the pilot does not substitute for the normal explicit existing-Item-Set reuse workflow. Quantity/item/price changes after confirmation require a new reviewed business submission, not an unverified completion flag. Static category/code projection in `sync-worker/email/catalog.js` is generated from `data/item-master.js`; regenerate it whenever that source catalog changes.

### Recovery and kill switches

- Disable test sending first to stop future dispatch. Disable the pilot to stop new pilot commands. A tab can leave pilot mode even after the server disables it; normal non-email flows remain available.
- `held`: permission, source, connection, approved policy or original Gmail message changed/unavailable. Investigate; do not start a new conversation automatically.
- `needs_verification`: provider timeout/unknown result or expired sending lease. Gmail may already have accepted the email. Inspect provider evidence before any separately authorized reconciliation; there is no blind retry button.
- Only a definitely rejected rate-limit response retries automatically (60/300/900 seconds). Failed/held/ambiguous first messages block completion delivery.
- Retain protected records/audits during rollback. Never delete an outbox row simply to resend; its unique event key prevents duplicates.

Additional local checks:

```sh
node --test tests/settlement-transform.test.cjs tests/copro-email*.test.cjs
node scripts/test-copro-email-browser.cjs
node scripts/test-form-master-loading-browser.cjs
node scripts/test-promotion-edit-browser.cjs --shell --revision
```

## Production conversation selection (2026-10-19)

The post-submission Co-Promotion Yes path now requires email, rather than silently falling back to an accounting-only save. It selects production policies only, previews actual campaign details and exact approved To/CC, and requires explicit confirmation. A queued result is not Gmail acceptance or delivery. Failed email preparation retains the user's form and the already-saved promotion.

Apply `005_email_production_threads.sql` before this backend revision. It adds `delivery_mode` without rewriting campaign rows or existing policies; legacy policies remain test-only. The old `mode` column is retained solely for schema compatibility. New readers and dispatch use `delivery_mode` as authoritative. Do not change a policy's delivery mode in place; publish a new reviewed policy. Outbox snapshots pin the mode as well as recipients and message references.

Managers can search and publish real conversations, selecting Production in Email Settings. The sender must be a participant in the chosen original message; approved To/CC must be participants. Search results remain manager-only and ordinary submitters see audience-scoped policy summaries. Each campaign/month selects its own approved conversation. Production and test dispatch switches do not authorize each other's messages.

When production capabilities are enabled, a new submission attempts verified email registration automatically; no separate pilot switch is required. Users without email access can still save ordinary promotions. Choosing Co-Promotion cannot fall back to a non-email success. An ordinary registered promotion without a Co-Promotion record follows ordinary IT settlement. Existing unverified submissions are not adopted by title and are not resent automatically.

Live prerequisites remain: confirmed Microsoft API registration/scope, administrator and actor grants for verified immutable identities, owner-completed Gmail consent, published real conversations and recipients, and enabling connection/Co-Promotion/production sending. Do not interpret deployed code or configured secrets as a connected mailbox. No live mail was sent during implementation; browser provider calls use mocks.
