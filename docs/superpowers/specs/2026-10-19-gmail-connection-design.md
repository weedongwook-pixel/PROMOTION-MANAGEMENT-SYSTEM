# Gmail connection — first implementation slice

Date: 2026-10-19 (Asia/Bangkok). Status: awaiting written-design approval. This document narrows the earlier campaign-thread design to account connection only; it does not authorize sending messages, deploying, or migrating production data.

## Outcome

Add an Email Settings page to the existing promotion website. A server-authorized administrator can connect the Gmail sender `it@rocks-foods.com`, see the verified account and connection status, and disconnect it. The existing promotion saving and Microsoft login behavior remain unchanged. No automatic sends, mailbox search, campaign mail bindings, or dispatch scheduler are enabled in this slice.

## Confirmed setup

- Google Cloud project: `potato-promotion-mail`.
- OAuth client type: Web application.
- Public client ID: `626917153875-bsnv8et0f8eav1nf91u7ttl03gdhaaus.apps.googleusercontent.com`.
- Screenshots confirm configured Gmail scopes `gmail.send` and `gmail.readonly`, and Internal audience. These screenshots are not proof that the mailbox belongs to the project's Workspace organization or that owner consent has been granted.
- Client secret has not been provided or configured in the Worker. Do not request it in chat.
- No authorized callback is implemented yet. The proposed route below is not an instruction to register a working URL now.
- Existing mail templates are previews; the Worker does not currently implement an email connection service.

## Options and chosen boundary

Recommended: use the existing Microsoft staff identity for server-side administrator authorization, separately from Gmail's mailbox-owner consent. This preserves the earlier security design and does not require an Outlook sender mailbox.

An alternative Google-only administrator login would introduce another staff identity/session system; that is a separate design decision, not a silent workaround for missing Entra consent. A localStorage Admin role or the shared synchronization token is never an alternative authorization mechanism.

The UI and isolated tests can be developed without live credentials after plan approval. Real connect routes must fail closed while administrator identity or Google credentials are incomplete. No claim that Gmail is connected should be made from the configured OAuth client alone.

## UI

- Add a theme-matched, TH/EN Email Settings page available to administrators. Navigation visibility is not security.
- Show distinct states: configuration incomplete, administrator sign-in required, not connected, authorizing, connected to the verified sender, reconnect required, disconnected, and safe connection error.
- Show a configuration checklist without secret values, a Connect Gmail button only when the server reports readiness, and a confirmation before Disconnect.
- Display that mail sending is disabled for this first slice. Do not show campaign mail controls until a subsequent approved phase.
- Connection failures must not log the administrator out of the promotion website or discard filled promotion data.

## Backend and credentials

- Add isolated email identity, OAuth, storage and routing modules to the sync Worker; keep existing campaign routes and shared-token behavior unchanged.
- Require server-verified Microsoft API access tokens with expected tenant, issuer, audience, expiry and scope. Use protected administrator grants keyed by tenant ID and object ID, not client role/name or generic synchronized user data. Reject Graph-audience tokens for this API.
- Candidate registrations from the earlier setup: tenant `512d498e-05ac-402b-a2aa-d61d10c3bee8`, staff client `8c0e2312-d9ae-4dff-accb-65fa3cb9815e`, email API client `b7f444d1-1e1a-4e6b-a3f1-49298836671d`, exposed scope `access_as_user`. These must be confirmed during configuration; the admin-consent status and initial administrator object ID are not yet verified.
- Proposed routes: authenticated status, begin authorization, disconnect; OAuth callback at `/email/gmail/callback`. Final deployed callback URL will be supplied after implementation/tests and approved disabled rollout, not guessed during Google setup.
- Use cryptographic, expiring, single-use OAuth state bound to the authenticated administrator and browser session, and PKCE. Validate callback and exact expected mailbox identity. Reject wrong account, replay, missing scopes, expired state and altered redirect.
- Store Google client secret and an independent encryption key through Worker secret tooling only. Keep refresh tokens encrypted in dedicated D1 storage excluded from generic `/promo/store`, exports intended for users, frontend assets and logs. Never return access/refresh tokens to the page.
- Dedicated tables are additive. Disconnect cancels pending consent attempts and removes local stored credentials; explain and support owner revocation of Google access. No business campaigns are deleted or restored.

## Required configuration before live use

1. Confirm email API scope/consent for the staff client and initial server-managed administrator tenant/object ID.
2. Account owner confirms permission to connect `it@rocks-foods.com` and its membership in the Google Workspace organization required by Internal audience.
3. Configure the client secret and encryption key securely, not in chat or frontend code.
4. Complete tests, obtain migration/deployment approval, export D1, deploy with all sending disabled, then register the exact callback.
5. Administrator initiates Gmail consent. Connection status becomes connected only after real successful callback and account verification.

## Verification

- Authorization: forged browser roles, shared-token-only calls, unknown staff, wrong audience/tenant, expired or tampered JWTs fail closed.
- OAuth: wrong account/state/session, replay, expired attempt, provider failure, token secrecy/encryption, refresh failure and disconnect.
- Storage: no email secrets or grants appear in generic reads/exports; campaign data unchanged.
- Browser: bilingual setup/readiness states, connect/disconnect errors, no accidental provider requests, and existing login/forms still work. All provider calls mocked.
- Live activation and any test send are separate approvals. Future sending requires an explicit internal test recipient/content, approved conversation selection and safe reply headers; no UOB/partner replies in this slice.

## Next step

Approve this connection-only design, then review its implementation plan before inline implementation. The prior full campaign-thread plan remains a future phase, not implicit scope for this account-connection slice.
