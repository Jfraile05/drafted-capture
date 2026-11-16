# Sidekick 1.0.12

Automatic pauses no longer leave the session stuck after moving to a different safe page. The new foreground page is inspected before resuming, and the pause interval remains excluded from time and estimated earnings. Sensitive and uninspectable pages stay gated. Manual Pause wins over an automatic resume, including concurrent navigation.

Idle pauses show a bottom-right Continue / Keep paused prompt next to the earnings pill. Pointer movement on the same page does not dismiss the prompt or resume recording. Continue resumes that page after its privacy check. Opening a safe page resumes an idle pause automatically. Keep paused in the idle prompt converts the pause to a manual pause, which remains paused across navigation.

The earnings pill layout and calculations are unchanged. The user confirmed it was already present.

Verification: automated tests cover safe-page resume, pause exclusion, sensitive destinations, background tab events, manual pauses, and the manual-pause/auto-resume race. A browser fixture using the real overlay verified Continue and Keep paused messages and the bottom-right layout. Full installed-Chrome validation remains a separate check.

Both the production unpacked folder and the separate synthetic demo are updated. Reload the relevant extension in chrome://extensions and refresh any already-open test pages so their content scripts use the new version. The demo still uses simulated receipts and requires opening its popup on each new test origin for temporary screenshot permission.
