# Coding Challenge

## Context

[Challenge Context](./Smart%20Package%20Everest%20Coding%20challenge.pdf)


## Architecture

| Layer      | Tech                                      |
| ---------- | ----------------------------------------- |
| Backend    | Typescript, Express.js, sequelize, vitest |
| Database   | MySQL8                                    |
| Frontend   | React.js - Typescript                     |
| Deployment | Docker                                    |

```

```

## Backend APIs

[API draft](./api.md)

## Data Model

[High-level data model for Levels 1–4](./data-model.md)

## Out of scope / Limitation

- Authentication
  - There will be no authorize checking for Admin and Delivery Agent
- Smart locker callback
  - The status of the IOT locker is mocked
- Current package details and pickup code are stored on the locker model; package history is not retained.
