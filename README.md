# Smart Package Locker Management System

```mermaid
flowchart LR
    agent[Delivery agent]
    customer[Customer]
    operator[Operator]

    subgraph system[Smart Package Locker Management System]
        create([Create lockers])
        list([View lockers and events])
        store([Store package])
        retrieve([Retrieve package])
    end

    operator --> create
    operator --> list
    agent --> store
    customer --> retrieve
```

## Tech Stack

| Layer                  | Technology                       |
| ---------------------- | -------------------------------- |
| Backend                | TypeScript, ExpressJS, Sequelize |
| Database               | MySQL 8                          |
| Frontend / Demo-client | TypeScript, React                |
| Deployment             | Docker                           |

## Project structure

```text
src/
  routes/          HTTP endpoints
  schemas/         Request validation
  controllers/     HTTP request and response handling
  services/        Locker workflows and storage pricing
  repositories/    Database queries and transactions
  models/          Database Models
tests/             API and integration tests
examples/
  demo-client/     React demo client
docs/             API reference, data model, and specifications
.github/
  workflows/      GitHub Actions test workflow
```

## Run with Docker

Prerequisite:

- Docker Compose
- Port 3000, 3001, 3002 are available

From the project root run:

```sh
docker compose up --build
```

Services will be available at the following endpoints:

| Services    | Endpoint                      | Description                                                             |
| ----------- | ----------------------------- | ----------------------------------------------------------------------- |
| api         | `http://localhost:3000/api/*` | REST API for locker and charge rules refer [API reference](docs/api.md) |
| demo-client | `http://localhost:3001`       | [Demo React client for trying the API with UI](#demo-client)            |
| MySQL       | `localhost:3002`              | MySQL Database                                                          |

## Tests

Prerequisite:

- Docker Compose
- Node.js 22 or newer

```sh
npm ci
npm test
```

The repository tests require Docker because they run MySQL through `@testcontainers/mysql`.

## Demo Client

The [React demo client](examples/demo-client/) lets you test the API in a browser at `http://localhost:3001`.

### Locker management

Create lockers and inspect their current assignments.

![Locker management page showing locker sizes, statuses, and package assignments](docs/images/demo-client-manage.png)

### Locker console

Store or retrieve a package through the demo interface.

![Locker console with store and retrieve package actions](docs/images/demo-client-console.png)

### Concurrency test

Send concurrent storage requests and inspect each result.

![Concurrency test showing successful assignments and requests with no available locker](docs/images/demo-client-concurrency.png)

## Run development server

Prerequisite:

- Docker Compose
- Node.js 22 or newer

```sh
docker compose up mysql
npm ci
npm run dev
```

## Other Document

- [Data Model](docs/data-model.md)
- [Storage pricing](docs/specs/storage-pricing.md)

## Out Of Scope or Not Implemented

- **Access control:** Admin and delivery operations have no authentication or role-based authorization.
- **Production deployment:** The tracked `.env` and published service ports support local demonstration, not production secret management or network security. The services may be reachable from other devices on the host network.
- **Demo UI:** `examples/demo-client` is a small React client for trying the API, not a production quality frontend. The backend remains the source of truth for locker and charge rules.
