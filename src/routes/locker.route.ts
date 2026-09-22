import express, { type Express, type Request, type Response } from "express";

export const router = express.Router();

router.get("/", (req, res: Response, next) => {
  res.send("hello locker");
});
