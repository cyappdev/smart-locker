# Contributor and AI assistant guide

This repository is a Smart Package Locker Management System coding challenge. Start with the [README](README.md) for setup and current behavior. This file records the project context and the conventions to follow when changing it.

## Project references

- [API reference](docs/api.md): request and response contracts, validation, and storage charge behavior. The running app mounts locker routes at `/api/lockers`.
- [README](README.md): architecture and stated limitations; [data model](docs/data-model.md): database columns.

If a proposed change conflicts with these documents, check the challenge requirement first and make the chosen behavior explicit in the API reference and tests.

## Behavior to preserve

Keep business rules out of controllers and SQL out of services. Add a new abstraction when it makes a concrete change or test easier, rather than introducing layers for their own sake.

- The server creates pickup codes, storage timestamps, and charges; clients cannot supply them.
- Charge calculation uses completed 24-hour periods from `lastOccupiedAt`. Zero-charge retrieval completes immediately. A positive charge requires `confirmCharges: true`; a preview leaves the assignment unchanged.
- Retrieval locks the matching occupied locker within a transaction. Calculate the response from the original assignment, then clear it only for a completed retrieval. Invalid timestamps or failed updates must leave the assignment occupied.
- Hardware opening and payment are outside this implementation. The list endpoint currently exposes package identifiers and pickup codes for debugging; treat that as a known limitation, not a security model.
- Storage allocation must lock and recheck the selected locker before assigning it. If another request claims it first, search again for the smallest suitable available locker. Preserve the concurrent MySQL tests that verify one assignment per locker.

## Validation and submission

Use Node 22 or newer. Run `npm run typecheck` and `npm test` after code changes. The repository tests use a disposable MySQL Testcontainer, so the full suite needs Docker. The separate opt-in integration suite requires `RUN_MYSQL_INTEGRATION=1` and a dedicated `TEST_DB_NAME` beginning with `splms_test`; never reset the development database to run tests.

Keep the [README](README.md) aligned with actual routes, setup, trade-offs, and test results. It contains the project's AI assistance disclosure; update that disclosure when AI-assisted work changes the submitted solution. Review and verify generated changes before submission.
