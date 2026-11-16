# Sidekick Synthetic Lab

A separate Chrome extension for testing with fictional projects and a local simulated receiver. It does not replace the production extension, sign into Firebase, upload to Drafted, or create payable earnings.

## Start

1. Keep the production Sidekick extension stopped while testing.
2. Double-click `Start workspace.command`. Keep its Terminal window open. Node.js must be installed; no package installation is needed.
3. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the `extension` folder inside this package.
4. Pin **Sidekick Synthetic Lab**. Open `http://localhost:38425/` in Chrome.
5. Open the extension, acknowledge local capture, and choose a workflow. No login or project ID is needed.

The synthetic extension has its own Chrome storage and ID. Your existing production data stays separate. This package uses the original 340px popup and side panel.

The demo grants temporary screenshot permission when you open its popup. After switching to a different test site, reopen the popup once. This restriction avoids requesting access to every website. Capture is also restricted in code to the exact test hosts on port 38425. Other local services and normal websites are excluded.

## Sample project

Three 30-minute sample sessions are created the first time the workflow picker loads. They include screenshots, steps, site tags and editable labels.

| Workflow | Base rate | Optional bonus | Sample earnings |
| --- | --- | --- | --- |
| Flight Booking | $1/hour | Off | $0.50 |
| Online Shopping | $1/hour | $0.50/hour | $0.75, opted in |
| Productivity | $1/hour | Off | $0.50 |

Initial dashboard: **1.50 active hours, $1.75 total**, with **$1.50 base + $0.25 annotation bonus**. New recordings add to those totals. The seeded sessions simulate 30 minutes each using four illustrative frames; they are not real recordings.

## Try every extension feature

| Capability | What to do | Expected result |
| --- | --- | --- |
| Workflow picker | Select Flight Booking or Productivity, then Shopping | Only Shopping offers the unchecked annotation bonus option. |
| Recording and screenshots | Start on a test site, type a fictional query, click, and scroll | Steps accumulate, screenshots are scheduled every two seconds with additional action screenshots. |
| Pause and resume | Pause, close the popup, wait, reopen and resume | The timer stays frozen while paused and continues from the stored fractional time. |
| Live ticker | Watch the small bubble on a test page | Active time and estimated earnings advance, then freeze when paused. |
| URL categorization | Move among Flights, Shopping, Productivity and Uncategorized | The saved step tags follow the test domain. Reopen the popup on each new site for screenshot access. |
| Privacy gates | Visit Banking, Inbox, Shopping checkout, or the password test page | Capture pauses. Keep paused stores no gated frames; explicit Resume recording authorizes the current sensitive page. Use fictional values only. |
| Idle | Leave a test page untouched for three minutes | The idle notice appears and the entire idle gap is excluded. Choose Continue on the same page, or open a new safe page to resume automatically. Manual Pause stays paused. |
| Review and replay | Stop and save, then Review session | Open Timeline, Replay at 2x to 6x, inspect a step, and edit a label. Seeded sessions are also available. |
| Save confirmation | Save a changed label or annotation | The review UI confirms the save. The same simulated receipt later advances to the new revision. |
| Bonus | Opt into Shopping before starting | The pinned hourly bonus is added to base pay for active time and appears separately in the dashboard. |
| Submission receipt | Open **Test controls** from the popup footer or Settings | Expand a simulated receipt to see its project, session ID, step count, labels, earnings and revision. |
| Offline queue | Take receiver offline in Test controls, stop a task or edit a label, then bring it online | The archive stays pending, then retries and updates one receipt without duplicate credit. |
| Fast idle simulation | During a recording, click Simulate 3 minutes idle | The test clock advances the last-input timestamp; the real idle handler pauses. Choose Continue on that page or open a new safe page. |
| Session cap | Use a disposable active session, then Simulate 24-hour cap | The test clock moves the session start back 24 hours and the real cap handler stops it. This intentionally creates a large synthetic earnings estimate. |
| Managed policy update | Click Gate productivity site, return to Productivity, then restore the policy | A locally simulated policy update adds a gate without rebuilding. Restoring the policy does not silently resume an already paused session. |

The timer controls intentionally alter synthetic clocks. They do not replace a three-minute idle test or a full-day soak test.

## Check whether submission succeeded

In Test controls, expand the session's entry under **Simulated receipt ledger**. Its ID starts with `synthetic-receipt:`. The receipt revision should match the saved session revision. Editing a label must update the same receipt. A queued session has no current receipt until the simulated receiver accepts it.

These are local simulation receipts, not proof of delivery to Drafted. The receiver does not transfer screenshot bytes over a network, so it cannot validate production upload limits, network transport, server permissions or actual payouts.

## Verification and limits

Automated checks cover synthetic totals, project isolation, local capture boundaries, replay fixture data, offline retry, stable receipt IDs, and label revisions. The build verifier rejects production Firebase endpoints and nonlocal host grants. Browser checks cover the local shopping, checkout and productivity pages. Installed-Chrome capture and the complete extension flow still need to be exercised after loading this package.

The production backend, real account authentication, actual payment, full-day network upload, and native desktop capture are outside this demo. The privacy gate retains the production detector's DOM/OCR limitations.

## Stop and reopen

Stop any recording in the extension, then press Control+C in the workspace Terminal. To reopen later, double-click the launcher again. If port 38425 is already in use, close the previous workspace Terminal or use the already-running workspace.
