# Managed privacy policy

The extension ships a baseline policy and a detector configuration. Students cannot edit the sensitive-domain list. The old `domain_blocklist` and `record_video` settings are ignored and removed on settings migration. Personal allowlists still restrict which sites are eligible; they cannot bypass a privacy gate.

## Remote publication

The extension reads `capture_config/privacy` from the existing Drafted Firebase project, using the offscreen Firebase connection. This document and its read rule have not been deployed by this change. An administrator must publish the JSON from `src/config/privacy-policy.json` with a strictly higher integer `version` for each update. The extension checks on worker startup and every 60 minutes. No capture data is sent in the policy request.

Add a narrowly scoped Firestore rule alongside the existing rules:

```text
match /capture_config/privacy {
  allow get: if request.auth != null;
  allow list, create, update, delete: if false;
}
```

Only trusted administrator tooling using the server SDK should publish policy changes. Check the deployed rules for overlapping broad grants before relying on this rule. The local extension cannot enforce server permissions by itself.

Each of the seven domain categories must contain at least one lowercase hostname, without wildcards, paths, or protocols. Domain matches include subdomains on a dot boundary. Path rules match complete route segments. The remote document is data only, never executable code. Malformed updates and lower or equal versions are ignored. The last valid cached policy remains active offline. Deleting the remote document does not disable the bundled or cached rules.

## Gate behavior

Starting with 1.0.12, moving away from a gated page to a different, fully inspected safe page resumes recording automatically. This also works when returning to a Chrome window on a different safe page. Keep paused on a privacy prompt applies to that gated page. A new sensitive or uninspectable page still requires a gate. Manual Pause remains paused across navigation. Navigation never grants approval to record a sensitive screen.

The prompt reads: "This screen may contain sensitive information. Are you sure you want to record this?" The choices are "Resume recording" and "Keep paused". All detected categories, including banking, payment, and password managers, require explicit confirmation. A normal Resume or keyboard shortcut does not grant consent on a sensitive screen.

Approval is scoped to the tab, URL, document identities, detected categories, and policy revision. Only a hash of that scope is retained in live session state. Navigation, switching tabs/windows, or a new policy invalidates approval. Paused time follows the existing timer and earnings calculation. Stop remains available while gated. No gate details or private-screen URLs are copied into archived session metadata.

Every captured action requires an active-page inspection. Screenshots are inspected before capture and again before storage, then checked against current session state under the live-state lock. A gate, Pause, Stop, or replacement session invalidates pending work. Periodic screenshots retain the fixed two-second cadence. Continuous desktop video cannot honor these page checks, so the worker and offscreen entry points reject new video recordings. Existing recorded archives are retained.

## Limits and verification

The domain list is a starting policy, not a complete inventory of every sensitive website. Detection covers configured routes, visible form fields and labels, inbox headings, accessible frames, and open shadow roots. Inaccessible frames, inspection failures, and scan-budget exhaustion fail closed. Loading pages produce no frames until checked. A known sensitive domain or route pauses even while loading.

This is a DOM and URL detector, not OCR. Text drawn into a canvas, closed shadow roots, images, and sensitive data in arbitrary page layouts may not be recognized. Browser capture and DOM inspection are separate operations, so a screen that appears and disappears entirely between both inspections can evade detection. Do not represent this as a guarantee that every possible piece of PII is removed. Broader OCR and a reviewed capture allowlist are separate production requirements if that guarantee is needed.

Tests cover managed-list validation and offline fallback, banking/checkout/inbox gates, sensitive-field signals and payment frames, in-flight screenshot rejection before storage, explicit and stale confirmations, pause persistence, policy changes, and session isolation. UI checks use local fixtures with synthetic fields. Live remote-policy publication and an installed-Chrome capture check remain deployment acceptance steps until verified.
