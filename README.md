# Smart Package Locker Management System

TypeScript, Express, Sequelize, and MySQL implementation of locker creation, storage, and retrieval through Level 3 of the [challenge](context/requirement.md). The [API draft](context/api.md) defines request validation, response shapes, and charge rules.

## Run

Use Node 22 or newer. Configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` in `.env`, then run `npm ci` and `npm run dev`. MySQL must already be available. The app calls `sequelize.sync()` and listens on port 3000.

```sh
curl -X POST http://localhost:3000/api/lockers/retrieve \
  -H 'Content-Type: application/json' \
  -d '{"lockerIdentifier":"A1","pickupCode":"048291"}'
```

A request under 24 hours returns `status: "retrieved"` with zero charges. At 24 hours or later, it returns `status: "charges_required"` and leaves the package in place. Send the same request with `"confirmCharges": true` to acknowledge the charge and complete retrieval. Confirmation recalculates charges at its own server time, so the amount can rise after a preview. No payment is processed.

Responses include `packageIdentifier`, `occupiedAt`, `calculatedAt`, and integer `chargesInCents`. The service bills completed 24-hour periods at 100 cents per day for days 1–5, 200 for days 6–10, and 300 thereafter. A missing, invalid, or future storage timestamp is treated as a server data error (HTTP 500); the assignment remains occupied.

The repository locks the matching occupied locker in a MySQL transaction. It clears the assignment only after the service has calculated a valid retrieval decision. The model stores only the current assignment and has no payment or package history. Hardware interaction is mocked. Locker allocation concurrency is outside this Level 3 implementation.

## Optional demo UI

The REST API is the primary interface and the part evaluated for business behavior. The `examples/web/` frontend is an optional demonstration that makes it easier for reviewers to exercise the API, not a separate implementation of the locker rules. The API remains the source of truth for locker allocation, retrieval, and storage charges; the demo submits requests and displays responses.

## Tests

Run `npm test` and `npm run typecheck` with Node 22 or newer. The repository tests start a disposable MySQL container, so Docker must be running for `npm test`. The separate opt-in database tests use `RUN_MYSQL_INTEGRATION=1` and `TEST_DB_NAME` set to a dedicated database whose name begins with `splms_test`. Set `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, and `TEST_DB_PASSWORD` as needed. Those tests create their own rows and delete only those rows; they never target the development database.

The current list endpoint includes debug `packageIdentifier` and `pickupCode` fields. This behavior is retained for now, although the API draft describes a public-only list response.

## AI assistance

OpenAI Codex assisted with the Level 3 plan, implementation, tests, and documentation. The approach was checked against the challenge requirements and API draft. The project owner remains responsible for reviewing and validating the submission.
