# Workflow assignments

Real project workflows require a Drafted assignment before starting a session. Signed-in status alone does not grant access to those projects. The three workflows and their rates live in `src/config/workflows.json`. Annotation flags are off for all three.

## Generalist local workflow

`src/config/local-workflow.json` currently enables Generalist so a signed-in user can try recording without project or assignment setup. While enabled, the picker shows Generalist and does not query the assignment service. Its $1/hour rate is illustrative, not an accepted earnings or payout record.

Generalist uses normal capture, pause, stop, labels and replay. With `"upload": true` in `local-workflow.json` (the current setting), Generalist sessions upload to Drafted automatically on Stop, with null project and organization IDs. With `"upload": false` they keep `workflow.local_only: true`, stay on the device, never enter the upload queue, and direct upload calls reject them. Sessions recorded while device-only stay device-only after the setting changes.

Set `enabled` to `false` and rebuild to return to assignment-only project selection.

## Backend contract

New collection, not yet provisioned or deployed: `capture_workflow_assignments`.

One document per Firebase Auth UID. Drafted administrators write these documents through a trusted backend or the Firebase console. The student extension only reads its own document.

```json
{
  "assignments": [
    {
      "workflow_id": "flight-booking",
      "project_id": "REPLACE_WITH_REAL_PROJECT_ID",
      "org_id": "REPLACE_WITH_REAL_ORG_ID",
      "active": true
    }
  ]
}
```

Valid initial workflow IDs: `flight-booking`, `online-shopping`, `productivity`. Use `null` for `org_id` only if the project is not owned by an organization. Empty project IDs, inactive assignments, unknown workflows, and conflicting duplicate assignments are excluded. No example IDs or test assignments are bundled into the extension.

Add this match inside the existing `/databases/{database}/documents` rules scope. This is an additive fragment, not a complete rules file:

```text
match /capture_workflow_assignments/{uid} {
  allow get: if request.auth != null && request.auth.uid == uid;
  allow list, create, update, delete: if false;
}
```

Student writes must remain denied. Do not put assignments on a profile document students can edit. Firebase server SDKs use their own IAM credentials and bypass these client rules: https://firebase.google.com/docs/firestore/security/rules-conditions.

The extension reads assignments from the server whenever the picker opens and again on Start, including the keyboard shortcut. A failed read prevents a new session. Remembering a selected workflow locally never grants access. Existing sessions can still pause and stop offline.

Each session pins the assigned project, organization, workflow name, and hourly rate in its metadata. Choosing another workflow or changing settings cannot reroute it. The upload payload retains the snapshot under `capture_metadata.workflow`.

The existing `credential_tasks` create rule permits any signed-in creator in the inspected backend checkout. This client access check does not replace server-side submission authorization. Before production, the backend must validate the session owner, workflow assignment and destination, then calculate accepted earnings itself. If authorization is checked at upload time, account for sessions that were valid when recorded and uploaded later after a grant changed.

## Optional annotation bonus

All shipped workflows, including Generalist, keep bonuses disabled. A trusted assignment may override the catalog with `annotation: { enabled: true, rate_cents_per_hour: 50 }`. The amount is illustrative; choose the real rate before enabling a project. Invalid overrides are ignored. Students cannot set their own rate.

Flagged projects show the bonus rate and an unchecked opt-in. Starting a task rechecks the assignment and pins the authorized rate and opt-in in session metadata. Eligible opted-in sessions earn `active hours * bonus rate` in addition to base earnings. Pauses and idle time are excluded from both. The dashboard displays base and bonus separately; the uploaded estimate includes both. These remain client estimates until the backend validates them. Changing a project flag later does not rewrite an archived session's snapshot.

## Verification status

Local tests cover assignment filtering, missing and malformed data, revoked access, server failures, account isolation, Start without selection, and pinning workflow/project/rate through archival. UI verification uses isolated fixture data and never creates a backend assignment.

Live acceptance is pending real project IDs, an administrator-created assignment, and deployment of the owner-only read rule. No live backend project or grant is invented. The earnings dashboard shows estimates from saved sessions on this device. Exact agreement with a backend earnings ledger remains pending that backend contract.
