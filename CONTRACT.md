# drafted. Capture — Build Contract (READ FIRST)

This is the frozen interface every module binds to. **Do not edit any file under
`src/shared/`, the manifest, or the configs.** They are written and final. Import
from them; never redefine their types.

## The product in one sentence

An **ambient** computer-use trajectory recorder: the user flips capture ON and
**everything** they do across **every tab** (clicks + coordinates, keystrokes,
scrolls, navigation, screenshots) streams into one continuous `Session` as an
ordered list of `Step`s. There is **no task prompt** up front. Tasks are recovered
**afterward** by drawing `Segment`s over the timeline in the side panel. There is
**no AI-agent-drives-the-browser mode** — human capture only.

## Architecture (MV3, 4 contexts)

- **Service worker** (`src/background/`) — the brain. Owns capture state, the
  screenshot queue, step assembly, IndexedDB writes, badge, lifecycle, recovery.
- **Content script** (`src/content/`) — declared in manifest, injected into
  **all frames of all pages** at `document_start`. It only *listens* when the
  service worker says capture is ON. Emits `CAPTURE_EVENT` messages and paints
  the ambient overlay badge. NO action executor (that was agent mode — gone).
- **Popup** (`src/popup/`) — the one-flip on/off control + live counters.
- **Side panel** (`src/panel/`) — review timeline, inspector, replay, and
  post-hoc **segmentation/labeling**.
- **Options** (`src/options/`) — settings page.

## Source of truth

- Types: `src/shared/types.ts`
- Constants/defaults: `src/shared/constants.ts`
- Live session + settings accessors: `src/shared/storage/live.ts`
- IndexedDB (screenshots, steps, sessions): `src/shared/storage/db.ts`
- Rate-limit-safe screenshot capture: `src/shared/utils/captureQueue.ts`
- DOM extraction helpers: `src/shared/utils/selector.ts`
- Screenshot resize/base64/dims: `src/shared/utils/screenshot.ts`
- Action labels + icon names + fmt: `src/shared/utils/format.ts`
- React hooks (`useLiveSession`, `useSettings`, `sendMessage`): `src/shared/hooks.ts`

## Key invariants

1. **Coordinates are CSS pixels** (viewport, top-left origin). Screenshots are
   **device pixels**. `ScreenshotRef.dpr` carries `devicePixelRatio`. To draw a
   crosshair on a screenshot: `pixelX = coord.x * dpr` then scale to display size.
   Never assume dpr === 1.
2. **Screenshots may be `null`** on a step (protected page / rate limit). UIs must
   handle that. The step is still valid.
3. **Live vs archived.** While capturing, a small `LiveSession` lives in
   `chrome.storage.session` (no full step array — only `step_count`, `stats`,
   `recent[]`). Full `Step[]` live in IndexedDB via `db.ts`. On STOP, the worker
   assembles a full `Session` (steps + segments) into the sessions store and
   clears the live step chunk.
4. **All screenshot captures go through `captureVisible()`** from
   `captureQueue.ts`. Never call `chrome.tabs.captureVisibleTab` directly.
5. **Message passing**: UIs talk to the worker via `sendMessage(type, payload)`.
   The worker is the only writer of the live session and IndexedDB.

## Message protocol (see `MessageType` in types.ts)

UI/content → worker. Worker returns a value (the listener uses async sendResponse).

- `TOGGLE_CAPTURE` → flips idle↔capturing. Returns `LiveSession | null`.
- `PAUSE_CAPTURE` / `RESUME_CAPTURE` / `STOP_CAPTURE` → returns `LiveSession | null`.
- `CAPTURE_EVENT` (from content) payload `CaptureEventPayload` → `{ok:true}`.
- `GET_LIVE_SESSION` → `LiveSession | null`.
- `LIST_SESSIONS` → `Session[]` (summaries ok to send; they include steps).
- `GET_SESSION` payload `{id}` → `Session | undefined`.
- `DELETE_SESSION` payload `{id}` → `{ok:true}`.
- `EXPORT_SESSION` payload `{id, formats: ExportFormatFlags}` → triggers download.
- `SAVE_SEGMENT` payload `{sessionId, segment: Segment}` → updated `Session`.
- `DELETE_SEGMENT` payload `{sessionId, segmentId}` → updated `Session`.
- `UPDATE_ANNOTATION` payload `{sessionId, stepIndex, annotation}` → `Session`.
- `PING_CONTENT` → content replies `{capturing:boolean}` (worker→content).

## Worker → content messages

- `{type:'SET_CAPTURE', payload:{capturing:boolean}}` — content starts/stops
  listening + shows/hides overlay. (Not in MessageType enum; content defines its
  own handler. Use this exact shape.)

## Converters (exporters builder)

Implement `FormatConverter` (see types.ts) for keys `anthropic`, `openai`,
`universal`, `trajectory`. Register them in `src/shared/converters/index.ts`
(you create this). Each is a pure `(session, screenshots) => Promise<string>`.
The exporter in the worker resolves screenshot blobs from IndexedDB and zips
results with `fflate`.

## Design system (non-negotiable)

Deep-space dark. Tokens in `src/styles.css` + tailwind.config.ts. `drafted.`
wordmark = Poppins 800 with green `.` dot (`.wordmark` / `.dot` classes). Phosphor
icons only, **no emoji**. Green `#4DFFA0` = active/capture. Radial gradients only.
Import `'../styles.css'` once per entry tsx.

## Definition of done per builder

Your files `tsc --noEmit` clean against the contract and follow Biome formatting
(2-space, single quotes, semicolons, lineWidth 100). Don't import packages beyond
those in package.json (react, react-dom, @phosphor-icons/react, idb-keyval, fflate).
