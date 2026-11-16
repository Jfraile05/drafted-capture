# drafted. Capture — Chrome Web Store submission copy

Paste each block into the matching field in the Developer Dashboard. Sections map
to the dashboard tabs: **Store listing**, **Privacy practices**, **Settings**.

────────────────────────────────────────────────────────────────────────
## SETTINGS TAB
────────────────────────────────────────────────────────────────────────

**Publisher contact email:** rodrigo@joindrafted.com
  (You MUST enter this, then click the verification link Google emails you.
   Publishing is blocked until the email shows "verified".)

────────────────────────────────────────────────────────────────────────
## STORE LISTING TAB
────────────────────────────────────────────────────────────────────────

**Item title**
drafted. Capture

**Summary** (132 chars max)
Turn any browser session into structured computer-use training data. Flip it on, capture everything, label tasks later.

**Category**
Developer Tools

**Language**
English (United States)

**Detailed description** (min 25 chars — paste all of it)
drafted. Capture records what you do in the browser and turns it into clean, structured computer-use training data.

Flip it on and it works ambiently: every click with its coordinates, every keystroke, scroll, navigation, and a screenshot of the screen state are captured continuously across all your tabs. There is no task prompt to fill in first and no single-tab limit. You just turn it on, do your work, and turn it off.

Afterward, open the review panel to step through the full timeline, inspect any moment with its screenshot and a crosshair on the exact action point, and draw segments over spans of steps to label them as tasks. Sessions upload automatically to the selected Drafted project.

Sign in to record. Sessions sync automatically after a project is selected. Drafted-managed checks pause on detected sensitive screens and ask before resuming. Password fields are masked.

Built for students, researchers, and annotation teams producing high-quality human demonstration data for computer-use AI models.

Key features
- One-click ambient capture across every tab
- Clicks, coordinates, keystrokes, scrolls, navigation, and screenshots
- Post-hoc task segmentation: label spans of steps after the fact
- Timeline, step inspector, and replay
- Automatic sync with offline queuing and background retries
- Local capture with privacy controls and automatic Drafted uploads

────────────────────────────────────────────────────────────────────────
## PRIVACY PRACTICES TAB
────────────────────────────────────────────────────────────────────────

**Single purpose description**
drafted. Capture records the user's own browser interactions (clicks, keystrokes, scrolls, navigation, and screenshots) and uploads them automatically to the selected Drafted project as computer-use training data. That is its single purpose.

**Permission justifications** (one box each)

> tabs
Used to know which tab and URL each recorded action belongs to, to capture a screenshot of the active tab, and to keep recording continuous as the user moves between tabs during a session. Tab data is only read while the user has capture turned on.

> storage
Used to save the user's settings and the recorded session locally on their device (extension storage and IndexedDB). Sessions queue locally while offline and upload automatically to Drafted after sign-in and project selection.

> alarms
Used to take a periodic screenshot of the screen state on a fixed interval during an active recording, so passive page changes (a page finishing loading, a timer updating) are captured even when the user is not clicking. Also wakes the automatic upload queue to retry pending sessions.

> sidePanel
Used to open the review workspace in Chrome's side panel, where the user steps through their recorded timeline, inspects steps, labels task segments. UI only.

> host permission use (<all_urls>)
The extension records the user's own actions on whatever sites they choose to demonstrate a task on, which cannot be known in advance, so broad host access is required. It injects a passive, dormant content listener that only activates while the user has capture turned on, and managed sensitive-screen checks pause capture on detected private screens. A personal allowlist can restrict capture further. Recorded page context and screenshots upload to Drafted for the selected project.

> remote code use
The extension does NOT use remote code. All scripts, styles, and fonts are bundled in the package and run locally. Select "No, I am not using remote code."

**Data usage / certification checkboxes**
- Personally identifiable information: the extension can capture whatever is on the user's own screen, stored locally and uploaded to Drafted. Disclose that screenshots and typed text are included.
- We do NOT sell or transfer user data to third parties.
- We do NOT use or transfer data for purposes unrelated to the single purpose.
- We do NOT use or transfer data to determine creditworthiness or for lending.
- Check the final box certifying compliance with the Developer Program Policies.

**Privacy policy URL** (required — host the page in store/privacy.html somewhere public)
https://joindrafted.com/capture-privacy

────────────────────────────────────────────────────────────────────────
## GRAPHIC ASSETS (Store listing tab)
────────────────────────────────────────────────────────────────────────

- Store icon (128x128):  store/store-icon-128.png
- Screenshots (1280x800): store/shot-1-flip.png, shot-2-live.png, shot-3-review.png
- (Optional) small promo tile 440x280 can be added later; not required to publish.

────────────────────────────────────────────────────────────────────────
## VISIBILITY (after upload)
────────────────────────────────────────────────────────────────────────
Set Visibility = Unlisted so only people with the link can install.
