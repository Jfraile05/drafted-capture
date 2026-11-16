# Sidekick 1.0.11

## Included

The extension now includes the workflow picker, device-local estimated earnings dashboard, URL categorization, managed privacy gates, input-based idle detection, live earnings ticker, and optional annotation bonus. The original compact popup stays 340px wide. Screenshot cadence stays fixed at two seconds, in addition to action-triggered screenshots.

Idle detection defaults to three minutes and clamps configuration to two through three minutes. Pointer movement, clicks, scrolling, and typing refresh the active tab's last-input timestamp. Pauses backdate to that timestamp, excluding the full idle window from hours and estimated pay. Browser input resumes an idle pause only; manual and privacy pauses remain in force. Stop also handles a delayed idle alarm. State survives service-worker restart.

Annotation bonuses are implemented but disabled in every shipped workflow. A flagged assignment can offer a separate hourly bonus with explicit student opt-in. The dashboard and upload estimate use the same calculation, excluding pauses and idle time.

## Verified locally

- 206 automated tests pass, including capture races, sync retries, privacy gates, timer behavior, URL tagging, workflow access, idle recovery, and annotation calculations.
- TypeScript and the production build pass.
- UI fixtures verify bonus visibility, opt-in payload, separate base/bonus totals, and the idle notice. At 340px width, the idle view is about 423px tall and the flagged workflow view about 466px tall, with no horizontal overflow.

## Production acceptance still blocked

The Firebase CLI successfully listed accessible projects on November 14, 2026 and returned an empty list. No live project or student assignment has been provided. Generalist therefore remains deliberately local-only; it never uploads and its earnings are estimates, not payable credit.

Before production release:

1. Provide access to the actual Firebase backend and real project/organization IDs. Provision student assignments and owner-only read rules documented in `workflow-assignments.md`.
2. Deploy the managed-policy document and read rules documented in `privacy-policy.md`. Verify the installed Chrome extension on banking, checkout and inbox pages.
3. Add server-side authorization and an authoritative earnings ledger. Validate sessions and bonus eligibility on the server, then reconcile dashboard totals. Client estimates must never be the sole source for payouts.
4. Replace the inline trajectory document with a compatible chunked/storage artifact contract for long sessions. Update submission, enrichment, scoring, export and training readers together. A full-day trajectory can exceed Firestore's document limit; this release does not claim full-day cloud upload acceptance.
5. Verify a real assigned session uploads, receives a durable backend receipt, retries offline without duplication, and accepts label updates. Run a long-session/worker-restart Chrome soak.

The managed privacy detector has documented DOM/OCR limitations in `privacy-policy.md`; it is not a guarantee that all PII is removed. Retention, consent and dataset review need production ownership.

The native desktop phase remains a proposal in `desktop-proposal.md`, awaiting the approval explicitly required by Item 9.
