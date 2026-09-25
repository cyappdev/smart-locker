# Data Model


## Locker

The `Locker` model holds the current package assignment; there is no separate `Package` model. The `LockerEvent` model records successful package storage and completed retrieval in the same transaction as the locker update. Database columns use snake_case; TypeScript model properties and API fields remain camelCase.

| Column             | Nullable | Purpose                                                                       |
| ------------------ | -------- | ----------------------------------------------------------------------------- |
| id                 | No       | Auto-generated internal locker ID                                             |
| identifier         | No       | Unique physical locker label                                                  |
| size               | No       | Locker capacity: `small`, `medium`, or `large`                                |
| status             | No       | `available` or `occupied`; defaults to `available`                            |
| package_identifier | Yes      | Non-unique package name, label, or order reference for the current assignment |
| pickup_code        | Yes      | Unique code for the current assignment; stored as a string                    |
| last_occupied_at   | Yes      | Time the current package was stored                                           |
| created_at         | No       | Time the locker record was created                                            |
| updated_at         | No       | Time the locker record was last updated                                       |

## Locker events

`locker_events` has a required foreign key to `lockers.id` and a generated internal `id`.

| Column             | Nullable | Purpose                                                    |
| ------------------ | -------- | ---------------------------------------------------------- |
| locker_id          | No       | Locker associated with the event                           |
| event_type         | No       | `package_stored`, `package_retrieved`, or `status_changed` |
| locker_status      | No       | Locker status after the event: `available` or `occupied`   |
| package_identifier | Yes      | Package associated with the event, if any                  |
| charges_in_cents   | Yes      | Calculated charge associated with the event, if any        |
| created_at         | No       | Time the event was created                                 |
