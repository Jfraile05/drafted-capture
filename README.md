# drafted. Capture

Ambient computer-use trajectory recorder. Flip it on, do anything across any
tab, and every click, keystroke, scroll, navigation, and screen state becomes
structured training data. Label it into tasks afterward, or never. Export
lab-ready JSON for Anthropic, OpenAI, the Drafted Universal format, and the
Trajectory v1 schema.

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
    exporter.ts      Session -> converters -> ZIP -> download
  content/           injected into all frames, dormant until SET_CAPTURE
    index.ts         lifecycle, message listener
    capture.ts       passive event listeners, keystroke buffering, scroll throttle
    dom.ts           DOM context extraction (selector, xpath, aria, masking)
    overlay.ts       shadow-DOM recording badge (top frame only)
  popup/             one-flip on/off control + live stats + recent feed
  panel/             review timeline, inspector, replay, task segmentation, export
  options/           settings
  shared/
    types.ts         the frozen contract every context imports
    constants.ts     defaults, tuning, storage keys
    storage/         IndexedDB layer + live session / settings accessors
    utils/           captureQueue, screenshot, selector, crypto, format
    converters/      anthropic, openai, universal, trajectory
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
   label them as tasks after the fact, annotate, replay, and export a ZIP.

## Output

Export produces a ZIP with one JSON per selected format plus a `screenshots/`
folder of PNGs named by content hash:

| File | Format | Used by |
|---|---|---|
| `anthropic.json` | Anthropic Messages, `computer_20251124` tool | Claude training pipelines |
| `openai.json` | OpenAI Responses, `computer_use_preview` tool | GPT training pipelines |
| `session.json` | Drafted Universal (superset: DOM, segments, annotations, origins) | Drafted Labs, custom pipelines |
| `trajectory.json` | Drafted Trajectory v1 episode schema | Drafted dataset ingestion |

Recording, review, and export run locally and need no account or key. Submitting
a session to Drafted requires signing in with a Drafted account. When you submit,
the steps, screenshots, and optional screen recording are uploaded to Drafted.

## Privacy

Redaction runs in the extension before anything is stored. Emails, card numbers,
SSNs, API keys, tokens, and sensitive URL parameters are replaced with
placeholders such as `[email]`. Typed text in password, card, and one-time-code
fields is never stored, and "Mask all input values" hides every typed value.
Screenshots are not redacted, so use the allowlist or blocklist for sensitive sites.

Capture can be limited to an allowlist of domains ("Only capture allowed sites",
which captures nothing until you add a domain). A domain blocklist always wins
over the allowlist. Incognito windows are never captured. Protected pages
(`chrome://`, the Web Store) cannot be captured by Chrome and are recorded without
screenshots. Lab API keys, if set, go directly to the lab endpoint and never touch
Drafted servers.

## Known limits (v1)

- Step appends and live-session updates are read-modify-write. Under extreme
  concurrent event bursts a step could in theory interleave. The capture queue
  serializes the slow path, so in practice this is rare. A future pass can move
  appends to an atomic IndexedDB cursor write.
- Cross-origin iframe coordinates are reported relative to their own frame; the
  top-frame common case is exact.

Proprietary. Drafted Inc.
