# drafted. Capture

Ambient computer-use trajectory recorder. Flip it on, do anything across any
tab, and every click, keystroke, scroll, navigation, and screen state becomes
structured training data. Sessions sync automatically to the selected Drafted
project. Label tasks afterward in the review panel.

This is the ambient sibling of `drafted-computer-use`. Where that one is
task-first (describe a task, then do it), this one is capture-first: there is no
prompt up front and no single-tab limit. You turn it on and it watches
everything, everywhere, until you turn it off.

## Why it is built this way

A few decisions are load bearing:

- **One declarative content script in every frame, dormant until told.** It is
  injected at `document_start` into all frames but attaches zero listeners until
  the service worker says capture is on. Cost when idle is a single message
  listener. When a new tab or page loads mid-capture, it asks the worker for the
  current state and self-starts, so capture is truly continuous across tabs.
- **Every screenshot goes through one rate-limited queue.**
  `chrome.tabs.captureVisibleTab` throws past roughly two calls per second. A
  burst of clicks would blow through that instantly, so all captures funnel
  through `captureQueue.ts`, which spaces calls, coalesces requests that pile up,
  deduplicates identical frames by hash, and never throws. A capture that cannot
  happen (protected page, quota) yields `screenshot: null` and the action is
  still recorded, so the trajectory stays complete.
- **Coordinates are CSS pixels, screenshots are device pixels.** Every screenshot
  carries the `devicePixelRatio` at capture time. To place a crosshair you
  multiply the coordinate by dpr, then scale to the rendered image. This is why
  crosshairs land correctly on Retina displays instead of drifting up and left.
- **Live vs archived split.** While capturing, a small live session lives in
  `chrome.storage.session` (counts, stats, a short recent feed). The full step
  array lives in IndexedDB. On stop, the worker assembles the complete archived
  session and clears the live state. UIs subscribe to the live session reactively
  and never ship screenshots around to render counters.

## Architecture

Manifest V3, four contexts.

```
src/
  background/        service worker (the brain)
    index.ts         message router, tab listeners, alarm, command, recovery
    session.ts       start / pause / resume / stop lifecycle + archive
    coordinator.ts   event -> Step assembly, screenshots, tab events, guards
    sync.ts          background queue wakeups and recovery alarms
  content/           injected into all frames, dormant until SET_CAPTURE
    index.ts         lifecycle, message listener
    capture.ts       passive event listeners, keystroke buffering, scroll throttle
    dom.ts           DOM context extraction (selector, xpath, aria, masking)
    overlay.ts       shadow-DOM recording badge (top frame only)
  popup/             one-flip on/off control + live stats + recent feed
  panel/             review timeline, inspector, replay, task segmentation
  options/           settings
  shared/
    types.ts         the frozen contract every context imports
    constants.ts     defaults, tuning, storage keys
    storage/         IndexedDB layer + live session / settings accessors
    utils/           captureQueue, screenshot, selector, crypto, format
    syncQueue.ts     durable automatic uploads and retry backoff
    hooks.ts         useLiveSession, useSettings, sendMessage
    actionIcons.ts   ActionType -> Phosphor component (tree-shaken)
```

## Develop

```bash
cd drafted-capture
npm install        # or reuse node_modules from the sibling package
npm run dev        # vite + crxjs watch -> dist/
```

Load `dist/` via `chrome://extensions` -> Developer mode -> Load unpacked.

The content script change requires reloading the page under capture; service
worker changes require the reload icon on the extension card.

## Build

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # biome
npm run build       # tsc + vite build -> dist/
```

The build produces a loadable `dist/` with the content script registered in all
frames, the background as an ES-module service worker, the side panel, popup, and
options pages, and auto-generated web-accessible resources.

## Use

1. Click the toolbar icon. First run shows a three-line explainer.
2. Press the big toggle (or `Ctrl/Cmd+Shift+Y`). Capture starts across every tab.
3. Do anything. A small `drafted.` badge sits bottom-right of each top frame. The
   popup shows live counts, a timer, and a recent-actions feed.
4. Press Stop. The session is archived locally.
5. Open the review panel (clock icon). Step through the timeline, inspect any
   step with its screenshot and crosshair, draw segments over spans of steps to
   label them as tasks after the fact, annotate, and replay.

## Earnings dashboard

The main menu shows estimated earnings and active hours above the workflow
picker. Totals refresh after a session is saved, edited, or removed and when
the popup opens. Only retained sessions owned by the signed-in account with
a saved workflow rate are included. Generalist practice totals stay separate
from assigned-project totals; legacy sessions without a rate are excluded.

The calculation uses active milliseconds with pauses removed, multiplied by
the hourly rate saved when recording started. Estimates retain microdollars
so short sessions are not rounded away before the total is displayed in cents.
New project uploads include the same `capture_earnings_estimate` calculation.

These are device-local estimates, not confirmed payouts or a cross-device
earnings balance. Backend ledger reconciliation remains pending the real
project and earnings backend. Transport tests verify identical estimate values
against an isolated backend stub, not the deployed service.

## Live earnings ticker

The existing on-page bubble shows estimated earnings for the current session
and its active recording time. It uses the same pinned workflow rate, pause
intervals, and microdollar calculation as saved sessions and the dashboard.
The timer updates on second boundaries; dollar amounts display cents, so at
$1/hour the amount changes roughly every 36 seconds. These remain estimates.

Manual and privacy pauses freeze both values. Navigation restores the clock
from the worker, and returning to a hidden tab catches up from timestamps.
The paused ticker sits above a privacy prompt. Stop removes it and clears its
timer. A missing legacy workflow rate displays N/A instead of invented earnings.
Tests verify that the final estimate equals the saved session's contribution
to the dashboard, including stopping while paused.

## URL categories

Captured steps store `origin.site` with a normalized domain and automatic category.
The rules live in `src/config/url-categories.json`. Add domains or a path prefix
there to extend the map. Subdomains match on a dot boundary, with more specific
hosts and paths taking precedence. Unknown sites retain their domain and use
`uncategorized`; invalid or browser-internal URLs have an empty domain.

URL changes, tab switches, actions, and periodic screenshots all use the same
classifier. Screenshot capture checks the active tab and URL before and after
capture and discards mismatched frames. New and edited task segments store a
deduplicated `sites` list for their inclusive step range. Manual task categories
and labels remain separate. The review panel shows the step's site category;
task site lists stay collapsed until opened.

Older sessions derive missing tags when reviewed or uploaded, without rewriting
archives. Existing saved tags remain stable when rules change. Initial uploads
and subsequent task-label updates include segment tags. This map categorizes
sites; it does not grant permission to capture them or replace privacy gates.

## Automatic sync

This build enables the local Generalist workflow for trying the recording flow
without backend assignments. Generalist recordings stay on the device and show
"On this device". Disable `src/config/local-workflow.json` before switching to
the real project workflow flow below.

Sign in, choose an assigned workflow, and select Start a task. Workflows and
rates are defined in `src/config/workflows.json`; Drafted controls student
assignments. See [workflow assignment setup](docs/workflow-assignments.md) for
the backend contract and deployment prerequisites. Start checks access against
the server, including starts from the keyboard shortcut.

Stopped sessions are archived in IndexedDB with their account, assigned project,
workflow rate and sync revision. A hidden offscreen page
uploads independently of the popup; a Chrome alarm retries after failures and
browser restarts. The interface shows only Uploading or Synced. Synced requires
a server acknowledgement of every captured screenshot and the session record.

New sessions require an assigned project. Older sessions without a project
remain on the device until their destination is configured.
Existing archives with no recorded owner are never assigned to another account.
The stable session ID prevents duplicate task creation after a lost receipt.

The interval between periodic screenshots is fixed at two seconds in config.
Action-triggered screenshots retain their existing capture behavior.

## Privacy

Redaction runs in the extension before anything is stored. Emails, card numbers,
SSNs, API keys, tokens, and sensitive URL parameters are replaced with
placeholders such as `[email]`. Typed text in password, card, and one-time-code
fields is never stored, and "Mask all input values" hides every typed value.
Screenshots mask detected sensitive regions before storage. Managed privacy gates
inspect the active page, including accessible frames and open shadow roots,
before actions and screenshots, and again before persisting a screenshot.
Banking, checkout, inboxes, login screens, and detected sensitive fields pause
capture and require an explicit choice. Approval applies to that screen only;
navigation, a new document, or a policy revision requires a fresh check.

The popup and on-page prompt offer "Resume recording" and "Keep paused".
The pause survives closing the popup and service worker restarts. A gate or
Pause invalidates in-flight capture permits. Sensitive-domain settings and the
continuous-video option have been removed. Continuous desktop video bypasses
page inspection, so new video recording is disabled; existing archives remain
readable. The optional personal allowlist can only restrict capture further.
Incognito and uninspectable screens produce no saved frames.

Built-in domain and route rules live in `src/config/privacy-policy.json`.
The extension checks for a newer managed policy on worker startup and hourly,
retains the last valid version offline, and falls back to the bundled policy.
No student UI or message writes the managed policy. See
[privacy policy deployment](docs/privacy-policy.md) for the backend setup still
required to publish live updates and for the detection limitations.

## Known limits (v1)

- The current backend stores trajectory steps in a single Firestore document.
  Long sessions can exceed Firestore's [1 MiB document limit](https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields).
  They remain queued locally, but need a chunked storage contract and matching
  backend reader before long-session uploads can be signed off.
- Item 1's live project upload acceptance check is pending a real project
  destination. Queue and transport tests use an isolated backend stub, not the
  deployed Firestore rules.
- Step appends and live-session updates are read-modify-write. Under extreme
  concurrent event bursts a step could in theory interleave. The capture queue
  serializes the slow path, so in practice this is rare. A future pass can move
  appends to an atomic IndexedDB cursor write.
- Cross-origin iframe coordinates are reported relative to their own frame; the
  top-frame common case is exact.

Proprietary. Drafted Inc.
