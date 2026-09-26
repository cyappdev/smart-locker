import express from "express";
import { sequelize } from "../configs/database.ts";

export const createHealthRouter = () => {
  const router = express.Router();

  router.get("/", async (_req, res) => {
    try {
      await sequelize.authenticate();
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "error" });
    }
  });

  return router;
};
