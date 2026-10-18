import "./env.js";
import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import app from "./app.js";
import { migrate } from "./migrate.js";
import { seed } from "./services.js";
import { close } from "./db.js";
await migrate();
await seed();
if (existsSync("dist")) {
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
}
const server = app.listen(
  Number(process.env.PORT) || 3001,
  process.env.HOST || "0.0.0.0",
  () =>
    console.log(
      `Dance Palace API: http://localhost:${process.env.PORT || 3001}`,
    ),
);
const shutdown = () =>
  server.close(async () => {
    await close();
    process.exit(0);
  });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
