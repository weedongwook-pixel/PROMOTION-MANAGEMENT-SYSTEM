# Co-Promotion email pilot — existing conversation, two notifications

Date: 2026-10-19, Asia/Bangkok. Status: written design approved by the user's “ยืนยัน”; implementation plan pending review. This extends the implemented but disabled Gmail connection slice. It supersedes the event scope in the 2026-10-18 campaign-thread proposal for this pilot only. It does not authorize deployment, account consent, production backfill or actual sends to partners.

## Confirmed outcome

Only Co-Promotion participates. One campaign uses one approved existing email conversation and sends at two milestones:

1. The user's initial promotion submission commits successfully: one email containing the submitted promotion details.
2. IT completion and Interface ERP confirmation have both committed successfully for every applicable active button of that campaign: one combined confirmation email, including promotion details and confirmation of both tasks. Do not send separate IT-completion and Interface emails.

Order does not change the condition. Usually Interface is the last action; if Interface precedes IT completion, the later IT commit completes the condition. A click, code allocation or code confirmation is not IT completion. Cancelled buttons are excluded, but an entirely cancelled campaign does not qualify. Repeated clicks, page loads and retries must not queue another ordinary milestone event. The first pilot has no automatic edit/revision resend or historical backfill; that policy requires a separate decision.

## Chosen approach and alternatives

Use the existing Gmail connection, a server-managed approved-conversation registry, and a durable server outbox. Admin/IT first approve a conversation and recipients; users select only approved summaries. This is preferred to exposing full-mailbox search to MKT or trying to match Subject alone. Manual copy/paste or mailto would leave the requested automation and deduplication unsolved.

The user approved proceeding with the two event conditions and explicitly requested entering external email addresses during testing. This authorizes building external-recipient test controls, not sending to unspecified addresses or all partners. Production Reply All recipients must still be explicitly previewed and confirmed per approved conversation; test-mode address entry does not enable unrestricted production dispatch.

## How the existing loop is selected

The sender mailbox must have received a genuine message in the intended conversation. Add it through Reply All/CC in that conversation; an unrelated forward is not a substitute for the original message reference. Authorized mail administrators search Gmail header metadata and inspect Subject, sender, date and To/CC. They approve the exact conversation and a normalized, deduplicated recipient snapshot, excluding the sender and any BCC inference.

Ordinary users see only summaries published to their permitted audience, not the mailbox or arbitrary Gmail IDs. On the Co-Promotion form they select a loop, preview outbound details and approved recipients, then confirm. The binding includes stable campaign/month identity and conversation-policy version, never just a campaign title or table row number. Changing the policy or recipients invalidates prior confirmation.

Replies use the Gmail thread ID, matching Subject and valid In-Reply-To/References from the approved original message. If that original target is missing or revoked, pause delivery rather than silently create a new conversation. Outlook ultimately controls its own conversation presentation; real Gmail/Outlook grouping must be checked during the explicitly approved pilot.

## Durable events and business-state integration

Add dedicated server tables for conversation policies, campaign bindings, event outbox and delivery audit, excluded from generic promo_store APIs and user exports. Immutable outbox content and recipient snapshots are created in the same transaction as the opted-in business commit. Failed saves create no message. A failure to queue an opted-in event must not produce a misleading successful email status.

Use unique keys based on stable campaign/month ID and milestone (`submitted` or `it_interface_complete`). Completion checks read authoritative persisted IT and Interface states, not browser flags or a browser-supplied completed boolean. Server commits must identify the applicable buttons and verify campaign relationship before counting completion. No unrelated campaigns are rewritten to add email.

Current Interface UI calls confirmErpInterface and catches failures with an empty handler, then shows success in finally. Replace that behavior in scope: distinguish actual business success, queued mail, provider acceptance and failure. Existing notification templates are not evidence of mail delivery. The new outbox path must not double-dispatch through the old browser notification path.

## Individual authorization

The shared synchronization bearer and local browser roles never authorize mailbox search, thread publication, recipient approval, binding changes or actual sends. Reuse the dedicated verified Microsoft API token and add protected server permissions for mail administrators, permitted submitters and IT completion actions. Bind actors by tenant/object ID, not mutable display name or email alone.

Existing generic campaign sync must not be able to trigger external mail by writing spoofed status data. Email-enabled submission and completion transitions must pass a verified-actor server route that validates the campaign relationship and business state before its transactional event insertion. Users without the required verified identity can continue existing non-email saving; email is explicitly unavailable rather than silently sent or falsely queued. Live activation is blocked until these permission and actor-to-campaign checks are verified.

## Delivery and testing boundary

Default mode is disabled. Development uses mocked Gmail and isolated D1. The user prepares a separate test conversation with Subject `Test send to email copro UOB`, addressed to their chosen test recipients and CC'ing `it@rocks-foods.com`. The name UOB in the Subject does not authorize use of real UOB contacts or messages. Do not reply to a real partner conversation while merely replacing recipients, because that can expose external conversation context.

The test UI allows the authorized user to enter external email addresses themselves. Show a preview of the exact test To/CC and outbound content before confirmation. Never add the original conversation's recipients automatically. The confirmed test recipients become a server-enforced, versioned allowlist for that campaign's two milestone messages; changing addresses invalidates confirmation. They must belong to the separately approved test conversation or the administrator must approve the changed test audience explicitly. Do not infer authorization from a Subject search or an address previously mentioned in chat.

Before any actual test send, the exact entered To/CC, sample content and account-owner consent must be confirmed. No real address is assumed or prefilled as an approved recipient. Server permissions, connected mailbox and explicit test enablement are required independently of browser input. Saving a preview or choosing a loop must not itself send. The first milestone queues after successful initial campaign submission; the second queues after both business tasks commit. Future production recipient policies remain a separate enablement step.

A server dispatcher claims leased outbox work; it does not require an open browser. Recheck kill switch, connection, policy revocation and recipient mode before dispatch. Store Gmail acceptance separately from final delivery/read claims. Do not promise absolute exactly-once delivery: if Gmail may have accepted a send but its acknowledgement is lost, mark needs verification and reconcile or require administrator review rather than blindly resend. Clearly rejected transient requests receive bounded retry; revocation or invalid recipients stop delivery.

Email content is limited to approved promotion details, relevant codes, dates and completion confirmation. Exclude internal remarks, credentials, mailbox history and attachments by default. HTML/text/header injection must be rejected or escaped. Links require normal website authorization; they grant no public access.

## Verification and rollout

- Mock tests cover submission success/failure, missing loop/permission, stale recipient confirmation, campaign ownership, non-CoPro exclusion, atomic queue insertion and duplicate submissions.
- Completion tests cover IT only, Interface only, both orders, partial multi-button completion, cancelled buttons, repeated clicks, concurrent commits and failed Interface persistence.
- Mail tests cover exact reply headers, approved recipients, test-only allowlist, policy revocation, paused original thread, safe content, worker leases and ambiguous provider outcomes.
- Browser tests cover selecting an approved conversation, preview/confirmation, errors without losing form data, truthful Interface status and separated campaign/mail status, TH/EN and notebook/mobile.
- Regression tests retain existing Gmail connection security, Microsoft login and ordinary promotion workflows.
- Additive D1 migration and frontend/backend deployment require explicit approval and a verified backup. Deploy disabled first. Gmail connection prerequisites from the connection runbook remain outstanding until verified; writing OAuth client settings is not a live connection.

## Written-design approval

Approve this updated file before an implementation plan is written. Implementation begins only after that plan is reviewed and inline execution is selected. The exact user-entered test recipient/content and live consent are separate prerequisites to actual sending, not code-development blockers.
