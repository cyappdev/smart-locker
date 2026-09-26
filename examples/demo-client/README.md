# Smart Locker demo client

A React interface for creating lockers, inspecting assignments and events, storing and retrieving packages, and sending concurrent storage requests. Storage fees are calculated by the backend.

Run the full system from the repository root with `docker compose up --build`, then open http://localhost:3001.

For frontend development, start the API on port 3000 and run:

```sh
cd examples/demo-client
npm ci
npm run dev
```

`VITE_BACKEND_BASE_URL` selects the API URL. The Docker build uses `/` and nginx proxies `/api/` to the API container.

```sh
npm run build
npm run lint
```

The concurrency page sends real storage requests and occupies available lockers. It is a manual demo; automated MySQL tests in the root project verify assignment correctness.
