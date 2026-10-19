# Full promotion editing within an existing campaign

Status: awaiting written-design approval. No product implementation or deployment for this change yet.

## Intended outcome

The original reporter edits the original proposal form instead of re-entering a campaign. Allow adding/removing product rows and POS buttons and moving buttons up/down. Preserve the existing green theme, TH/EN behavior, Cloud-first save receipts, ownership rules and post-IT reason workflow.

This extends the existing campaign edit flow, not the create-new-campaign flow. Creating/deleting whole campaigns, renaming the Cloud campaign key, changing the target month, changing ownership and switching proposal form type remain outside this edit operation. Existing IT tools remain unchanged.

## Form behavior

- Restore Add Button and Remove Button controls for the existing campaign.
- Retain at least one valid button and one valid item per button before saving.
- Existing product add/remove/category/Subset controls remain available; the simplified Coupon scope selector is retained.
- Add explicit Up/Down controls to every button, disabled at the first/last boundary. Use accessible labels and TH/EN copy, preserve focus after movement and mark the edit dirty.
- Button display order is saved as the submitted order, not alphabetical or code order.
- Deleting a button asks for confirmation and states that previously used codes are not automatically returned. Cancelling the edit or failing Cloud save changes nothing remotely.
- Existing and new buttons use the same form validation, including explicit required Net values, quantities, names and Subset ranges. Do not silently apply zero defaults to a missing required price.
- Existing type/channel choices may change only if supported by code ownership rules; incompatible changes must produce an inline explanation rather than reuse an incompatible old code.
- Attachment replacement uses a staged upload committed with the edit. An unchanged attachment is retained. Referenced historical files are not deleted as a side effect.

## Button identity and code ownership

- Existing buttons have stable server-validated identities. Reordering or renaming their short names must retain their identities and codes.
- A newly added button carries a temporary distinct client identity, never a copied existing identity/code. The server generates the persistent identity and ignores client-supplied workflow/code fields for new buttons.
- Reserve codes using the existing form-specific allocation policy only at successful Cloud commit, never when clicking Add or Move. An Item Set requiring IT assignment remains pending under the existing IT policy; do not invent a new numbering policy.
- Counter updates, uploaded attachment references, campaign replacement, activity and receipt commit atomically with expected-version guards. Concurrent allocation/edit conflicts must not partially consume codes.
- Removal omits the button from the active campaign but preserves its complete prior rows in immutable edit history. Keep its codes reserved/used; do not automatically release or recycle them. Any later release is an explicit IT workflow.
- The server rejects duplicate existing identities, forged identities and invalid product-row references. A removed button from a previously opened form cannot be silently resurrected by a stale save.

## IT and OP workflow

- Preserve original reporter and submission dates. Record editor and edit time separately.
- If the campaign has prior IT work, require a reason; focus and highlight the reason box when missing. Return work to IT and clear current OP completion while retaining historical evidence.
- Add/remove/reorder changes appear in the IT revision summary, along with changed prices/items and user reason.
- Work without prior IT completion remains pending without requiring a reason solely because the form was opened for editing.
- New buttons must not inherit completed IT/OP state, confirmed Item Set references, master-product bindings or used codes from a neighboring button.

## Implementation boundaries

Current constraints exist in `js/promotion-edit.js` (hidden/disabled controls and collection), `js/promotion-edit-model.js` (fixed button identity set), and `sync-worker/worker.js` (versioned edit transaction). The Worker imports the same model as the browser, so frontend and backend must be rolled out compatibly.

Extend the shared model with explicit existing/new identities, stable order and a structural change summary. Extend the existing Cloud edit endpoint to allocate only new codes and stage attachments with guarded extra writes. Reuse or extract the existing form allocation logic rather than add a second inconsistent allocator.

Do not weaken the current ownership check or present browser roles as stronger identity proof than the existing login supplies. Individual server-verified identity remains a separate security improvement, not an implicit outcome of this feature.

## Verification and rollout

- Unit tests: add/remove/reorder, existing code preservation, new identity sanitization, duplicate/forged identities, required fields, original dates, other months unchanged, reason rules and structural summaries.
- Isolated D1 tests: transaction rollback, stale campaign/counter versions, duplicate save receipts, replay after lost response, upload failure, no automatic release and allocation concurrency.
- Browser tests: original sender edits all four forms, adds/removes/reorders and saves; cancel/failure retains Cloud data; reopen preserves order, codes and attachments; post-IT revision is visible to IT.
- Verify simplified Coupon UI remains available and compatible; it is already local but not deployed in this workspace.
- Back up current D1 and confirm authorized access before any production Worker rollout. A prior read-only audit received Cloudflare error 7403, so production access must be rechecked rather than assumed.
- Obtain explicit deployment approval after implementation and verification. Current approval is for scope/design discussion, not a claim the feature exists.

## Separate pending request

Campaign-table sorting (pending work first, completed OP work below ordered by completion time) is a separate UI task. Do not conflate button ordering within a campaign with campaign ordering in Tracking/OP tables.
