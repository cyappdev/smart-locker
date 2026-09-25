# Coding Challenge

## Context

[Challenge Context](./Smart%20Package%20Everest%20Coding%20challenge.pdf)

## Architecture

| Layer      | Technology                              |
| ---------- | --------------------------------------- |
| Backend    | TypeScript, Express, Sequelize, Vitest  |
| Database   | MySQL 8                                 |
| Frontend   | React and TypeScript                    |
| Deployment | Docker                                  |

### Code map

- `src/routes` and `src/schemas`: HTTP endpoints and Zod request validation.
- `src/controllers`: translate validated requests into service calls and responses.
- `src/services`: locker workflows and storage fee calculation.
- `src/repositories`: Sequelize queries and database transactions.
- `src/models`: the current locker and package assignment. Package history is not stored.
- `tests/services` and `tests/storage-fee-policy.test.ts`: business behavior; `tests/repositories`: MySQL persistence behavior.

## Backend APIs

[API draft](./api.md)

## Data Model

[High-level data model for Levels 1–4](./data-model.md)

## Scope and current limitations

- **Concurrent storage:** Retrieval uses a row lock to prevent two confirmations from releasing the same assignment. Storage allocation does not lock the chosen locker or retry when another request takes it, so optional Level 4 is not implemented.
- **Access control:** Admin and delivery operations have no authentication or role-based authorization. Pickup-code attempts are not rate limited.
- **Demo deployment:** The tracked `.env` and the MySQL port published to the host in `compose.yml` support local demonstration, not production secret management or network security.
- **Demo UI:** `examples/web` is a small React client for trying the API, not a production frontend. The backend remains the source of truth for locker and charge rules.
