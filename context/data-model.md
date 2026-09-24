# Data Model

The system uses a single Locker entity. Each locker holds the details of its current package assignment; there is no separate Package entity. This describes the data needed across all levels without implementing later-level behavior.

| Attribute | Nullable | Purpose |
| --------- | -------- | ------- |
| id | No | Auto-generated internal locker ID |
| identifier | No | Unique physical locker label |
| size | No | Locker capacity: `small`, `medium`, or `large` |
| status | No | `available`, `inactive`, or `occupied`; defaults to `available` |
| packageIdentifier | Yes | Non-unique package name, label, or order reference for the current assignment |
| pickupCode | Yes | Unique code for the current assignment; stored as a string |
| lastOccupiedAt | Yes | Time the current package was stored |
| createdAt | No | Time the locker record was created |
| updatedAt | No | Time the locker record was last updated |

## Level Coverage

| Level | Data model support |
| ----- | ------------------ |
| 1: Storage | Locker identity, capacity, and availability support creating and listing lockers. Current package details and pickup code are saved on the selected locker. Package size is request input and does not need to be persisted. |
| 2: Retrieval | The physical locker label (`identifier`, provided as `lockerIdentifier` in the retrieval request) and pickup code identify the current assignment. Successful retrieval clears `packageIdentifier`, `pickupCode`, and `lastOccupiedAt`, and returns the locker to `available`. |
| 3: Storage charges | `lastOccupiedAt` records the storage start time. Calculate the charge from this value before clearing the current assignment. Fee rules and calculated charges do not need separate persisted entities for the stated requirement. |
| 4: Concurrent requests | The same model can be used. Atomic selection and updates must be handled during implementation; the model alone does not guarantee safe concurrent allocation or retrieval. |

## Constraints and Assumptions

- `identifier` and non-null `pickupCode` values are unique in the database. `packageIdentifier` is not unique.
- Empty lockers have null current-assignment fields. An occupied locker has a package identifier, pickup code, and storage timestamp.
- `lastOccupiedAt` is the current assignment's storage time, not the most recent arbitrary locker update.
- Pickup-code format and collision handling will be defined during implementation. The unique constraint prevents duplicate stored codes but does not generate them.
- Uniqueness covers codes currently persisted on lockers; historical code reuse is not tracked after an assignment is cleared.
- The model retains no package, retrieval, or payment history. Those are outside the stated level requirements.
- Door state and hardware callbacks are mocked; there is no `opened` status.
