import { createApp } from "./app.ts";
import { createRouters } from "./composition/index.ts";
import { initDatabase } from "./configs/database.ts";
import "./models/index.ts";

async function main() {
  await initDatabase();
  const app = createApp(createRouters());
  app.listen(3000);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
