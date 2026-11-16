# Desktop app proposal

Status: proposal only, awaiting approval as requested in Item 9. No desktop app code or dependencies have been added.

Use Electron with the existing TypeScript and React UI for macOS and Windows. This is a proposed implementation choice because it lets the extension and desktop app share the workflow models, category configuration, active-time calculation, bonus calculation, and compact UI. Native capture and input adapters remain platform-specific.

Electron exposes screen and window sources through `desktopCapturer`; macOS screen recording requires user consent. See the [official capture documentation](https://www.electronjs.org/docs/latest/api/desktop-capturer).

## Components

- A main-process capture coordinator owns session state, idle detection, the 24-hour cap, privacy decisions, and the upload queue. Renderer windows cannot change rates or grant themselves capture access.
- A small React window handles login, assigned workflows, earnings, review, and settings. A tray/menu-bar control and compact floating ticker provide Pause and Stop.
- Platform adapters identify the foreground application and collect authorized input activity. macOS uses a signed helper for accessibility and foreground-app inspection. Windows uses a signed helper for foreground-window and input APIs. Validate these adapters on supported OS versions before committing to a library.
- A paired browser extension provides reliable browser URL and DOM signals through an authenticated local bridge. Without those signals, categorize by app and apply the stricter app-level privacy policy. Window titles alone cannot reliably identify a URL or private form.
- Capture still images every two seconds. Run privacy inspection before capture and validate the foreground target again before retaining the image. Full-screen capture must inspect every visible window, including background windows, or remain paused. Unknown or inaccessible surfaces stay paused. No audio in the first release.
- Store the pending queue encrypted on disk with keys protected by OS facilities. Define an explicit raw-data retention limit and delete acknowledged local payloads according to the approved retention policy.

## Shared backend

Both clients use the same authenticated workflow assignments and server-owned earnings ledger. The server validates assignment, pinned rate, accepted active time, bonus eligibility, and unique session ID. Retries must not produce duplicate earnings. A server lease prevents the same student from earning simultaneously in both clients. The dashboard distinguishes pending estimates from accepted earnings and payouts.

Long sessions need chunked trajectory storage, a final manifest/receipt, resumable uploads, and compatible training-data readers. The current inline Firestore trajectory is not an adequate desktop or full-day storage contract. Complete that backend work before desktop capture ships.

## Permissions and distribution

Explain screen-recording and accessibility permissions at the action that needs them. Permission denial or revocation pauses capture and earnings. Lock, sleep, logout, and crashes must stop capture safely. Use signed Windows installers and signed/notarized macOS builds with signed updates.

Keep Node integration disabled in renderers, enable context isolation and sandboxing, validate IPC senders and payloads, and package local UI assets. These follow [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## Acceptance sequence

1. Validate capture, input and permission handling on macOS and Windows using synthetic screens.
2. Verify sensitive apps, background windows, browser checkout pages, and permission revocation cannot retain frames while paused.
3. Verify idle backdating, manual pause, restart recovery, and extension/desktop mutual exclusion.
4. Verify offline upload recovery and one authoritative ledger entry per session, including annotation bonuses.
5. Run a full-day soak and compare both client dashboards against the same backend ledger.

Approval needed before implementation: Electron architecture and the staged acceptance sequence above. Production project access, the ledger, retention policy, and signing credentials must be configured outside chat before release.
