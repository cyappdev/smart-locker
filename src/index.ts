import { createApp } from "./app.ts";
import { initDatabase } from "./configs/database.ts";
import "./models/index.ts";

async function main() {
  await initDatabase();
  const app = createApp();
  app.listen(3000);
}

main().catch(console.error);
