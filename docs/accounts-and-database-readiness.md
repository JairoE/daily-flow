# Accounts And Database Readiness

## Purpose

Daily Flow currently stores one person's profile and bowel-tracking data only
on that device:

- Native builds use SQLite.
- Web builds use browser local storage.
- LLM prototype settings are saved in the local profile.
- Wellness questions and answers are not saved.

This document describes the product decisions, account information, data
model, security controls, and migration work needed before replacing the
testing storage adapters with a shared database.

## Decisions Needed Before Building Accounts

The following product decisions should be explicit before choosing an
authentication and database implementation:

1. Is every installation single-user, or can one device switch between
   accounts?
2. Must a person create an account before tracking, or can local-only use
   continue indefinitely?
3. Which sign-in methods are required: email magic link, passkey, Apple,
   Google, or password?
4. Is anonymous-to-account migration required without losing existing local
   data?
5. Should one account sync across web, iOS, and Android?
6. Is Daily Flow Pro+ a local prototype toggle, a paid entitlement, an
   invitation, or an administrator-granted feature?
7. Can a user share records with a clinician or caregiver, or is all data
   private to the account owner?
8. Which countries and data regions will be supported?
9. How long are deleted accounts, backups, notification records, and optional
   LLM metadata retained?
10. Will questions or answers ever be stored? The recommended default is no.

For an initial beta, the simplest product shape is one private account per
person, optional account creation after local use, cross-device sync, no
sharing roles, and no stored LLM question or answer content.

## Authentication Information

Use a managed authentication provider instead of implementing password storage
inside Daily Flow. The application database should reference the provider's
stable user subject.

Minimum account information:

| Field | Purpose | Notes |
| --- | --- | --- |
| `user_id` | Internal immutable account key | Server-generated UUID |
| `auth_subject` | Link to managed auth identity | Unique, never accepted from an untrusted request body |
| `email` | Sign-in and account recovery | Optional when the provider supports non-email identity |
| `email_verified_at` | Verification state | Prefer provider-owned truth |
| `display_name` | Friendly in-app name | Optional and editable |
| `timezone` | Local-date and reminder behavior | IANA timezone identifier |
| `locale` | Formatting and future localization | Optional for beta |
| `created_at` | Account creation audit | Server timestamp |
| `updated_at` | Account update ordering | Server timestamp |
| `deleted_at` | Account deletion workflow | Null until deletion begins |
| `terms_version` | Accepted terms version | Store only when terms exist |
| `privacy_version` | Accepted privacy notice version | Store only when notice exists |
| `consented_at` | Consent timestamp | Needed for material health-data processing consent |

Do not place OpenAI keys, proxy access tokens, password material, or raw payment
credentials in the profile table.

## Proposed Remote Data Model

PostgreSQL is a good default because the data is relational, date-oriented, and
requires strong per-user ownership constraints. The schema can work on
Supabase, Railway-hosted Postgres, or another managed PostgreSQL service.

### `users`

Stores the account fields above. Authentication may own a separate identity
table; in that case, `users.auth_subject` links the app record to it.

### `profiles`

One row per user for editable app preferences:

| Field | Notes |
| --- | --- |
| `user_id` | Primary key and foreign key to `users` |
| `display_name` | Current local profile value |
| `timezone` | IANA timezone |
| `check_in_time` | Local wall-clock time |
| `reminders_enabled` | Boolean |
| `private_notifications` | Boolean |
| `privacy_lock_enabled` | Boolean preference |
| `daily_open_love_shown_date` | Optional local-date key |
| `created_at`, `updated_at` | Server timestamps |

The LLM endpoint and access code should not become user profile fields in
production. Production clients should call one first-party backend URL, and
the backend should own provider credentials.

### `daily_entries`

One row per user and local calendar date:

| Field | Notes |
| --- | --- |
| `id` | Server-generated UUID |
| `user_id` | Required owner foreign key |
| `local_date` | User-local `YYYY-MM-DD` date |
| `had_bowel_movement` | Required boolean |
| `details_recorded` | Distinguishes legacy yes/no records |
| `stool_type` | Nullable integer constrained to 1 through 7 |
| `symptom_straining` | Boolean |
| `symptom_pain` | Boolean |
| `symptom_bloating` | Boolean |
| `symptom_incomplete_evacuation` | Boolean |
| `laxative_used` | Boolean |
| `laxative_note` | Nullable or empty, maximum 160 characters |
| `checked_in_at` | Client event time with timezone |
| `created_at`, `updated_at` | Server timestamps |
| `deleted_at` | Optional sync-friendly soft delete marker |
| `client_mutation_id` | Optional idempotency key |

Enforce a unique constraint on `(user_id, local_date)`. Every query and
mutation must scope ownership from the authenticated session, not from a
client-supplied user identifier.

### `devices`

Needed only for cross-device notifications and operational support:

| Field | Notes |
| --- | --- |
| `id` | Server-generated UUID |
| `user_id` | Owner |
| `platform` | `ios`, `android`, or `web` |
| `push_token` | Encrypted or provider-protected sensitive value |
| `app_version` | Helps migration and notification debugging |
| `timezone` | Device scheduling context |
| `last_seen_at` | Device lifecycle |
| `revoked_at` | Stop using lost or signed-out devices |

### `notification_preferences`

Profile fields may be enough for a beta. A separate table becomes useful when
each device can have different schedules, channels, or quiet hours.

### `notification_deliveries`

Store only if server-scheduled notifications need auditing. Suggested fields
are `user_id`, `device_id`, `type`, `scheduled_for`, `provider_message_id`,
`status`, `created_at`, and `updated_at`. Do not store notification body text
when metadata is sufficient.

### `entitlements`

Needed if Daily Flow Pro+ becomes account-backed:

| Field | Notes |
| --- | --- |
| `user_id` | Entitled user |
| `feature` | For example `daily_flow_pro_plus` |
| `status` | `active`, `trialing`, `expired`, or `revoked` |
| `source` | `manual`, `invite`, `app_store`, or `web_billing` |
| `starts_at`, `ends_at` | Entitlement window |
| `provider_customer_id` | Nullable external reference |
| `provider_subscription_id` | Nullable external reference |
| `updated_at` | Server timestamp |

The client should receive an entitlement result from the backend rather than
deciding Pro+ access from a locally editable boolean.

### LLM Requests

The recommended beta policy is not to persist question text, answers, daily
notes, or trend-summary values.

If operational records become necessary, store metadata only:

- User ID or a short-lived pseudonymous request ID.
- Request type: daily note or question.
- Model and provider.
- Outcome category and latency.
- Token counts.
- Safety classification.
- Created timestamp.

Content logging should require a separate documented purpose, explicit
retention period, access controls, and user disclosure.

## Authorization And Security

Bowel tracking is sensitive personal information even when a particular
organization is not legally subject to HIPAA. Build security around the data's
sensitivity rather than assuming a regulatory label does or does not apply.

Required controls:

- TLS for every client, API, database, and provider connection.
- Encryption at rest through the managed database and backup provider.
- Server-side authorization on every read and write.
- Row-level security or equivalent ownership policies keyed to the
  authenticated user.
- Separate development, staging, and production databases and credentials.
- Secrets stored in the hosting provider's secret manager, never in the app
  bundle or repository.
- Rate limits for authentication, sync, exports, deletion, wellness notes, and
  questions.
- Short, privacy-safe application logs that exclude health content and tokens.
- Audited administrator access with least privilege.
- Automated backups with restore testing.
- Dependency, secret, and vulnerability scanning.
- A documented incident response and user notification process.

Before clinician sharing, organizational accounts, or clinical claims are
added, obtain legal and security review for the applicable healthcare and
consumer privacy requirements.

## API Boundary

The client should use authenticated first-party endpoints such as:

```text
GET    /v1/me
PATCH  /v1/me/profile
GET    /v1/entries?from=YYYY-MM-DD&to=YYYY-MM-DD
PUT    /v1/entries/{localDate}
DELETE /v1/entries/{localDate}
POST   /v1/data-export
DELETE /v1/account
POST   /v1/wellness-note
POST   /v1/wellness-question
```

The API derives `user_id` from the authenticated session. It validates date
ranges, field lengths, stool-type constraints, allowed symptoms, and
idempotency keys. The LLM endpoints build summaries server-side once remote
entries are authoritative, so clients do not need to transmit health summaries
to a separate proxy.

## Local-To-Cloud Migration

Account creation must not silently overwrite existing device data.

Recommended migration flow:

1. Keep local tracking available before sign-in.
2. After account creation, explain what will sync and request confirmation.
3. Read and normalize every local profile and daily entry.
4. Upload entries with an idempotent import identifier.
5. Resolve the unique `(user_id, local_date)` key deterministically.
6. Confirm the server count and date coverage.
7. Mark the local dataset as linked to the account.
8. Keep a local cache for offline use.
9. Remove local data only through an explicit user action or account-deletion
   policy.

For a first import, prefer the entry with the latest `updated_at` when the same
date exists locally and remotely, but show a conflict instead of silently
merging incompatible detailed records. Server timestamps become authoritative
after sync begins.

The existing CSV export remains useful as a recovery and migration tool, but
normal account sync should use structured JSON APIs and idempotent mutations.

## Offline Sync Requirements

Moving to a database should not make logging depend on a network connection.
The app should write to the local adapter first and maintain an outbox of
pending mutations.

Each mutation needs:

- A stable client mutation ID.
- Target local date.
- Operation type.
- Normalized payload.
- Client update timestamp.
- Retry count and last error category.

On reconnect, send pending mutations in order, accept server versions, and
update the local cache. Account sign-out should define whether cached health
data remains on the device or is removed.

## Deletion, Export, And Retention

Before launch, define:

- How a user exports profile and entry data.
- Whether export includes notification and LLM metadata.
- How quickly account deletion removes active database rows.
- How long deleted rows remain in backups.
- Whether soft-deleted entries can be restored.
- How inactive accounts are handled.
- How support verifies an account owner without viewing health data.

Account deletion should revoke sessions and devices, stop notifications,
delete or anonymize active records, remove billing links where allowed, and
schedule backup expiry according to the published retention policy.

## Hosting Choices

Two reasonable beta paths are:

### Supabase

Provides managed PostgreSQL, authentication, and row-level security in one
system. It reduces initial integration work, but policies and migrations still
need careful review.

### Railway Plus Managed Authentication

Fits the existing Railway discussion and allows a conventional Node API plus
PostgreSQL. It offers more backend flexibility, but authentication,
authorization, migrations, queues, and operational controls require more
assembly.

The hosting decision should follow the identity, region, retention, sharing,
and Pro+ entitlement decisions rather than precede them.

## Recommended Delivery Phases

1. **Identity prototype:** Managed sign-in, `users`, `profiles`, and session
   authorization without moving entry data.
2. **One-time import:** Account linking and idempotent upload of existing local
   entries.
3. **Offline sync:** Local outbox, server conflict handling, and cross-device
   entry synchronization.
4. **Production LLM backend:** First-party authenticated note and question
   routes with server-built summaries.
5. **Notifications and entitlements:** Device registration, server scheduling,
   and account-backed Daily Flow Pro+ access.
6. **Operational readiness:** Export, deletion, retention, restore testing,
   monitoring, and incident procedures.

## Readiness Checklist

Database implementation can begin when these are answered:

- Account-required versus optional local-only use.
- Supported authentication methods.
- Anonymous-data migration behavior.
- Cross-device and offline-sync expectations.
- Conflict-resolution rule.
- Pro+ entitlement source.
- Sharing roles, if any.
- Data regions and supported countries.
- Export, deletion, backup, and retention policy.
- LLM content-storage policy.
- Notification ownership and scheduling model.
- Hosting, authentication, database, and secret-management providers.
- Privacy notice, terms, and consent requirements.
- Named owner for security incidents and account-support requests.
