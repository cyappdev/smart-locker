import express, { type Express, type Request, type Response } from "express";
import { router as locker } from "./routes/locker.route.ts";
import { initDatabase } from "./configs/database.ts";

async function main() {
  await initDatabase();
  const app: Express = express();
  app.use("/locker", locker);
  app.listen(3000);
}

main().catch(console.error);
