# Campaign email replies through Gmail

Date: 2026-10-18 (Asia/Bangkok). Status: proposed design, awaiting written-design approval. No implementation, account connection, live mail, or deployment is authorized by this document alone.

## Agreed outcome

Send saved promotion details and subsequent IT-completion updates from `it@rocks-foods.com` into an existing conversation. The mailbox is hosted on Gmail; recipients may use Outlook. Admin/IT curate approved conversations; MKT/RD cannot search the entire mailbox. Email is optional and must not compromise Cloud-first campaign saving.

## Approach and scope

Recommended: a server-side Gmail API adapter, an approved-conversation registry, and a durable D1 email outbox integrated with successful business transactions. A subject-only mailto link cannot reliably reply to an existing conversation. A separate Apps Script bridge is possible but adds another service and credential boundary; it is not the selected approach.

First release covers promotion submission and confirmed IT completion only. NPD, powder completion, Interface ERP completion, and a full notification-rule matrix remain later extensions; no existing event is silently enabled. No historical campaign emails are backfilled automatically.

## Existing-system findings and security prerequisite

The frontend uses Cloudflare static assets; `sync-worker/worker.js` persists Cloud-first submissions in D1. `js/email-templates.js` contains existing presentation templates, not proof of a production Gmail connection. Existing sync authorization checks a shared bearer token. Local role/name values are not trusted identities.

Email endpoints MUST require server-verified individual identities and server-assigned permissions before enabling mailbox access. A browser-supplied role, display name, or the shared sync token alone must never authorize mailbox search, approvals, recipient changes, or sending. Reuse a verified identity provider if available after authentication audit; otherwise implementing verified sessions is a prerequisite, not a UI-only substitute. Keep the email feature disabled until this prerequisite passes security tests. Do not rewrite unrelated campaign authorization as a side effect.

## Roles and UI

- Super Admin: connect/disconnect the Gmail account, manage authorized staff and the global email kill switch.
- Admin/IT with server-granted email-management permission: search paginated Gmail header metadata, inspect recipients, and register/revoke approved conversations. No full mailbox body, snippets, or attachments are returned to ordinary users.
- MKT/RD: see only published conversation summaries explicitly made available to them; select a conversation on the promotion form, review preview and approved To/CC, or choose no email. They cannot submit arbitrary Gmail IDs or arbitrary recipients.
- Campaign ownership/access applies independently of knowing a conversation ID. Staff publishing a conversation explicitly approve sharing its subject and approved recipients with the selected audience.

Forms retain their current save semantics. Show an optional email section before submission and a preview with subject, To/CC, and the actual outgoing fields. Confirmation binds to a versioned recipient/content configuration. Changing recipients, approved thread, or notification fields invalidates confirmation. Subsequent IT-completion emails use the explicitly approved policy; never silently add recipients found in newer messages.

## Connection and secrets

Owner authorizes the exact Gmail account through Google OAuth; do not ask for a password. Verify the connected account and restrict connection management to Super Admin. Use a short-lived, single-use state tied to an authenticated administrator, strict callback validation, and PKCE where supported.

Use only required Gmail scopes: read access needed for admin subject search and header retrieval, and send access. Do not request mailbox deletion or modification. Subject search may require a restricted read scope even if the service retrieves only metadata; document the consent and any applicable Google verification/security-assessment requirements before production activation. A label filter is a convenience, not an OAuth security boundary.

Store client credentials and encryption keys in Worker secrets. Store refresh tokens encrypted server-side, exclude them from generic store endpoints, logs, frontend bundles, backups intended for users, and exports. Support revocation and reconnect. Google Cloud project, Gmail API enablement, OAuth client, redirect URI, consent configuration, and owner authorization are deployment prerequisites requiring account-owner participation.

## Persistent records

Use dedicated server tables, excluded from `/promo/store` and generic key/value sync:

- Connection: account identifier, encrypted credentials, health/revocation metadata.
- Approved conversation: opaque public ID, Gmail thread/message IDs, RFC Message-ID and References, original subject, approved To/CC, audience, publisher, version, enabled/revoked state.
- Campaign binding: stable server campaign ID plus applicable month/revision, approved conversation/version, confirmed recipient snapshot, selected event policy, confirmer/time. Do not match by campaign title or table row index alone.
- Outbox: unique business-event key, campaign binding, immutable rendered-content snapshot, recipients, reference headers, status, attempts, lease expiry, provider response IDs, sanitized errors, audit times.

Add stable server identifiers where current records lack them, without duplicating or renaming existing campaigns. Preserve independent month/revision workflows and never bulk-replace campaign data for email migration.

## Save and delivery sequence

1. Server validates actor, campaign permission, published conversation, recipient/configuration version, and confirmation. Reject invalid email selections before committing; the filled form remains available. Users can choose to save without email.
2. Persist campaign changes and the corresponding outbox event in the same D1 transaction. A failed campaign commit must create no outgoing email. An opted-in commit must not succeed while silently losing its outbox event.
3. Return separate results: campaign saved and email queued. Never label queued email as sent.
4. A scheduled server dispatcher claims a leased outbox record and rechecks revocation/global disablement. It sends from the connected Gmail account, then records provider acceptance. The browser need not stay open.
5. IT-completion outbox insertion occurs only after persisted completion, in the same transaction as that transition. Confirming a code or clicking a button without a successful completion commit is not a completion event. Repeated saves do not resend the same event; a later distinct revision completion can generate a new event.

Generate replies using the selected Gmail `threadId`, valid `In-Reply-To`/`References`, and matching subject. Reply recipients come from the confirmed allowlist snapshot, not an unchecked automatic Reply All. Exclude the sender account, normalize/deduplicate addresses, reject header injection, and never infer BCC. Foreign email clients ultimately control conversation display; do not promise identical Outlook grouping.

Never start a new email automatically if the original conversation cannot be used. Pause that event and ask an authorized staff member to relink/approve the intended target.

## Content and external recipients

Initial safe content: campaign name/type, saved promotion details and dates, relevant confirmed codes, submitting/completing staff names, event time, and an authenticated deep link. Do not include internal IT notes, rejection details, credentials, raw mailbox history, or attachments by default. Admin explicitly approves the outbound field set when publishing a recipient policy, particularly when external recipients are present. A link never grants access without login/authorization.

## Reliability, delivery status, and audit

Statuses: queued, sending, accepted by Gmail, retry scheduled, failed, needs verification, cancelled. Provider acceptance is not proof of delivery/read by every recipient. Display campaign-save status separately throughout.

Use unique event constraints and worker leases to prevent ordinary double-click/concurrent sends. Exactly-once email delivery is not guaranteed: if the provider may have accepted a message but the response/state write is lost, mark needs verification; reconcile against sent-message identifiers if permitted, otherwise require Admin verification rather than blindly retrying. Retry clearly rejected transient failures with bounded backoff; stop on revoked credentials, invalid recipients, or policy changes. No automatic resend merely because a browser reloads.

Audit who approved the thread, confirmed recipients, queued the event, changed policy, retried, or cancelled delivery. Only authorized users see campaign mail history; mailbox search results are not globally exposed. Disconnect/revocation pauses pending sends while leaving saved business data intact. Retain only needed header metadata and delivery evidence under the company's retention policy; do not mirror the mailbox.

## Validation and rollout

- Unit/API tests: forged roles, shared-token-only requests, cross-user access, unpublished/revoked threads, malicious recipients/headers, name collisions, duplicate events, repeated revisions, stale confirmations, OAuth state replay, token redaction, and credential revocation.
- Transaction tests: Cloud save fails, outbox insertion fails, IT completion fails, and restart between provider response and audit update. No business-data loss or misleading success.
- Integration tests: mock Gmail adapter and isolated D1; ensure same-conversation headers, exact approved recipients, escaped text/HTML, worker lease recovery and no blind resend after ambiguous outcomes.
- Browser tests: all supported promotion forms, optional skip, allowed-thread search, preview/confirmation, errors without losing form input, separate save/mail outcomes, and IT completion.
- Controlled real-mail pilot only after owner consent and explicit test recipients: confirm Gmail and Outlook presentation. Do not use real partners as test recipients.
- Export current D1 before additive migration; deploy feature disabled, verify existing saves and Cloud receipts, then enable only the test audience. Kill switch stops email without reverting campaigns. Obtain separate deployment/send authority.

## References

- Gmail threading requirements: https://developers.google.com/workspace/gmail/api/guides/threads
- Gmail scopes and sensitivity: https://developers.google.com/workspace/gmail/api/auth/scopes

## Approval boundary

Approving this file permits preparation of an implementation plan. Implementation starts after that plan is reviewed and inline execution is chosen. Account connection and live email require explicit owner authorization; no account password should be shared in chat.
