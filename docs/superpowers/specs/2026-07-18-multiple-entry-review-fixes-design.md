# Multiple-Entry Review Fixes Design

**Date:** 2026-07-18

## Goal

Resolve the five blocking review findings on the multiple-daily-entry branch without expanding the pull request into a broad component or migration-framework refactor.

## Decisions

### Persistence is authoritative

An entry create, update, or delete is successful once local persistence succeeds. Refreshing derived UI state and synchronizing notifications are post-persistence work. Failures in that work must not reject the form as though the write failed, because retrying a successful create appends a duplicate event.

After a committed write, the app will update its in-memory entries immediately with a functional state mutation, attempt a storage refresh, and attempt notification reconciliation. Functional mutations preserve overlapping committed writes when refresh fails. A notification failure will keep the saved state and show a reminder-specific warning. A persistence failure will continue to reject the form and preserve its input.

### Notification reconciliation is date-aware

Only today's entry state may create a new logged-No or missed-check-in notification. Reconciliation for historical dates may cancel stale logged-No records but must never schedule a new notification. Reconciliation is serialized per local date so overlapping mutations cannot create orphan notifications or leave the database pointing at an older scheduled notification.

For today:

- Any saved entry cancels the missed-check-in reminder.
- A No-only day schedules one logged-No reminder.
- Any Yes entry cancels the logged-No reminder.
- Deleting the final entry cancels the logged-No reminder and restores today's missed-check-in reminder only when its fire time is still in the future.

### Future dates are read-only

Calendar dates after today remain selectable so the calendar does not change navigation behavior, but the selected-day panel will not expose create or edit actions. Both the editor and the top-level create handler will reject a future date as defense in depth.

### Native migration is atomic

When the legacy unique-date table is detected, missing daily-entry columns and the table rebuild will run through the same Expo SQLite 57 exclusive transaction object. A thrown query will roll back the complete daily-entry migration. The modern schema path will still add any missing columns and ensure the date/time index without rebuilding.

### Tests control time

History screen tests will freeze the local wall clock to 2026-07-17 so the selected-yesterday default remains deterministic in every timezone. Notification tests will also control local time and assert local trigger components rather than an Eastern-specific UTC timestamp.

## Scope boundaries

This work will not extract the duplicated Today and History forms, introduce idempotency tokens, or replace schema introspection with a version-number migration framework. Those are valuable follow-up refactors but would materially expand this already-large feature pull request.

## Verification

Each behavior will be implemented with a failing regression test first. Completion requires the full Jest and server suites, TypeScript, and the Expo web export to pass.
