# Sidekick: Chrome Web Store submission copy (version 1.0.19)

Paste each block into the matching field in the Developer Dashboard. Sections
follow the dashboard tabs: Package, Store listing, Privacy, Distribution.

The live item "drafted. Capture" (ID lpjabpanndaajdijdmlibdamdcjcdnni, version
1.0.0) is published from Drafted's developer account. If you can open that item,
upload this package to it so existing installs update. A new item gets a new ID.

## Package

Upload `store/release/sidekick-1.0.19.zip`, built with `npm run build` and zipped
from inside `dist/` so `manifest.json` sits at the top of the zip.

The item name and summary come from the manifest:
- Name: Sidekick by Drafted Labs
- Summary: Flip it on. Every click, keystroke, scroll, and screen state across
  every tab becomes structured computer-use training data.

## Store listing

**Description**

Sidekick records the work you do in Chrome and turns it into training data for computer-use AI. You get paid for the tasks you send to Drafted.

How it works
- Sign in with your Drafted account and pick a task.
- Press Start and work as you normally would. Sidekick saves each click, typed entry, scroll, page change and screenshot as a step.
- Pause or stop any time. A small on-page pill shows when Sidekick is recording.
- Recording pauses after 2 minutes of inactivity. If you do not come back within 20 minutes, the session is submitted on its own.
- Open the review panel to go through your steps, replay the session and label the tasks you did.
- Sessions upload to Drafted on their own, and each one gets a quality review.

Privacy
- Nothing is recorded until you press Start, and incognito windows are never recorded.
- Password, card, contact and address fields are blacked out in screenshots, and what you type in them is never saved.
- Emails, phone numbers, card numbers and ID numbers on the page are blacked out before a screenshot is saved.
- Banking, email, login, payment and health pages pause recording until you choose to continue.
- You can limit recording to sites you pick, or hide everything you type.

Sidekick is in beta. You need a Drafted account to record.

**Category:** Productivity (Workflow and planning)

**Language:** English (United States)

**Graphic assets**
- Store icon (128x128): `store/store-icon-128.png`
- Screenshots (1280x800):
  - `store/sidekick-shot-1-record.png`
  - `store/sidekick-shot-2-review.png`
  - `store/sidekick-shot-3-privacy.png`
- Small promo tile (440x280) is optional. `store/promo-small-440x280.png` still
  shows the old "drafted. Capture" branding, so leave it off for now.

**Official URL / homepage:** https://joindrafted.com

**Support URL:** https://joindrafted.com

## Privacy

**Single purpose**

Sidekick records the user's own browser activity (clicks, typed text, scrolls, page changes and screenshots) while the user has recording turned on, and uploads it to the user's Drafted account as computer-use training data.

**Permission justifications**

tabs:
Used to know which tab and page each recorded step belongs to, to take a screenshot of the active tab, and to keep one recording going as the user moves between tabs. Tab data is read only while recording is on.

scripting:
Used to add the recording listener to tabs that were already open when the user pressed Start, and to check a page for sensitive content (such as an email inbox or a sign-in form) so recording can pause before anything is saved.

storage:
Used to save the user's settings and recorded sessions on the device until they upload, including while offline.

alarms:
Used to take a screenshot on a fixed interval during a recording so page changes are captured between clicks, to time an idle pause, and to retry uploads that failed.

idle:
Used to pause recording when the user steps away from the computer, so idle time is not recorded or counted.

sidePanel:
Used to show the review panel in Chrome's side panel, where the user goes through and labels their recorded steps.

offscreen:
Used to process and upload saved screenshots in the background when the popup is closed.

notifications:
Used to tell the user when recording paused because they were idle, and to offer to start recording a task they have already chosen.

Host permission (<all_urls>):
Users record tasks on whatever sites the task needs, which cannot be known in advance. The content script stays inactive until the user presses Start. Sensitive fields are blacked out, sensitive pages pause recording, and users can limit recording to sites they pick.

**Remote code:** No, I am not using remote code. All scripts, styles and fonts are in the package.

**Data collected** (tick these):
- Personally identifiable information (screenshots can show a name or similar details that the masking does not catch)
- Authentication information (sign-in pages pause recording, but disclose to be safe)
- Web history (pages visited during a recording)
- User activity (clicks, mouse position, scrolls, typing)
- Website content (screenshots and visible page text)

Leave unticked: Health information, Financial and payment information, Personal communications, Location.

**Certify all three:**
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://joindrafted.com/capture-privacy

## Distribution

**Visibility:** Unlisted (only people with the link can find and install it).

**Regions:** All regions.
