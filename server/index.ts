import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import path from "path";
import fs from "fs";
import os from "os";
import { config } from "./config.js";
import { db } from "./db.js";
import { migrate } from "./migrate.js";
import { registerWebSocket } from "./ws/index.js";
import { sessionRoutes } from "./routes/sessions.js";
import { photoRoutes } from "./routes/photos.js";
import { downloadRoutes } from "./routes/download.js";
import { captureRoutes } from "./routes/capture.js";
import { eventRoutes, getActiveEvent } from "./routes/events.js";
import { contactRoutes } from "./routes/contacts.js";
import { findMeRoutes } from "./routes/findme.js";
import { startCapture } from "./capture/index.js";
import { startInternetMonitor } from "./delivery/index.js";
import { startCloudSync } from "./delivery/cloud.js";
import { startDynamoSync } from "./delivery/dynamo.js";

async function main() {
  // Ensure storage directories exist
  const dirs = [
    config.storagePath,
    path.join(config.storagePath, "photos", "full"),
    path.join(config.storagePath, "photos", "thumb"),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Ensure watch folder exists
  fs.mkdirSync(config.watchFolder, { recursive: true });

  // Run migrations
  migrate();
  console.log("Database ready");

  const app = Fastify({ logger: false });

  // Plugins
  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyWebsocket);

  // Serve processed photos (legacy flat structure)
  await app.register(fastifyStatic, {
    root: path.join(config.storagePath, "photos"),
    prefix: "/storage/photos/",
    decorateReply: true,
  });

  // Serve per-session photos
  await app.register(fastifyStatic, {
    root: path.join(config.storagePath, "sessions"),
    prefix: "/storage/sessions/",
    decorateReply: false,
  });

  // Serve built client (production)
  const clientDist = path.join(import.meta.dirname, "..", "dist", "client");
  if (fs.existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: "/",
      decorateReply: false,
      wildcard: false,
    });

    // SPA fallback
    app.setNotFoundHandler((_req, reply) => {
      reply.sendFile("index.html", clientDist);
    });
  }

  // Routes
  await registerWebSocket(app);
  await app.register(sessionRoutes);
  await app.register(photoRoutes);
  await app.register(downloadRoutes);
  await app.register(captureRoutes);
  await app.register(eventRoutes);
  await app.register(contactRoutes);
  await app.register(findMeRoutes);

  // Config endpoint for frontend
  app.get("/api/config", async () => {
    const activeEvent = getActiveEvent();
    return {
      eventName: activeEvent?.name ?? config.eventName,
      autoResetSeconds: config.autoResetSeconds,
      wifiNetwork: config.wifiNetwork ?? null,
      wifiPassword: config.wifiPassword ?? null,
      activeEvent: activeEvent ?? null,
    };
  });

  // Seed demo data endpoint
  app.post("/api/seed", async () => {
    const { nanoid } = await import("nanoid");
    const sharp = (await import("sharp")).default;

    const colors = [
      { r: 60, g: 80, b: 120 },
      { r: 100, g: 70, b: 90 },
      { r: 50, g: 90, b: 80 },
      { r: 90, g: 75, b: 50 },
      { r: 70, g: 60, b: 100 },
      { r: 80, g: 50, b: 70 },
    ];

    // Create 4 sessions with placeholder photos
    const sessionNames = [null, null, null, null];
    for (let s = 0; s < sessionNames.length; s++) {
      const sessionId = nanoid();
      const shortCode = nanoid(6).toUpperCase();
      db.prepare(
        "UPDATE sessions SET status = 'expired' WHERE status = 'active'"
      ).run();
      db.prepare(
        "INSERT INTO sessions (id, short_code, name, status) VALUES (?, ?, ?, ?)"
      ).run(sessionId, shortCode, null, s === 0 ? "active" : "complete");

      const numPhotos = 3 + Math.floor(Math.random() * 5);
      for (let p = 0; p < numPhotos; p++) {
        const photoId = nanoid();
        const color = colors[(s * 3 + p) % colors.length];
        const fullDir = path.join(config.storagePath, "photos", "full");
        const thumbDir = path.join(config.storagePath, "photos", "thumb");
        const fullPath = path.join(fullDir, `${photoId}.jpg`);
        const thumbPath = path.join(thumbDir, `${photoId}.jpg`);

        // Generate colored placeholder images with sharp
        const width = 1200;
        const height = 800;
        const tWidth = 400;
        const tHeight = 267;

        // Vary the color slightly per photo
        const r = Math.min(255, color.r + p * 15);
        const g = Math.min(255, color.g + p * 10);
        const b = Math.min(255, color.b + p * 12);

        await sharp({
          create: {
            width,
            height,
            channels: 3,
            background: { r, g, b },
          },
        })
          .jpeg({ quality: 85 })
          .toFile(fullPath);

        await sharp({
          create: {
            width: tWidth,
            height: tHeight,
            channels: 3,
            background: { r, g, b },
          },
        })
          .jpeg({ quality: 80 })
          .toFile(thumbPath);

        db.prepare(
          `INSERT INTO photos (id, session_id, original_filename, original_path, full_path, thumb_path, status, width, height, file_size)
           VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)`
        ).run(
          photoId,
          sessionId,
          `DSC_${String(s * 10 + p).padStart(4, "0")}.NEF`,
          `/placeholder/${photoId}`,
          fullPath,
          thumbPath,
          width,
          height,
          50000
        );

        db.prepare(
          "UPDATE sessions SET photo_count = photo_count + 1 WHERE id = ?"
        ).run(sessionId);
      }
    }

    return { ok: true, message: "Seeded 4 sessions with placeholder photos" };
  });

  // Start capture in watch mode by default (can switch via /api/capture/start)
  await startCapture("watch");

  // Start internet monitor + SMS retry loop
  startInternetMonitor();

  // Start cloud photo upload + email delivery (only runs when internet available)
  startCloudSync();

  // Start DynamoDB sync (only runs when internet available)
  startDynamoSync();

  // Start server
  await app.listen({ port: config.port, host: config.host });

  const lanIp = getLanIp();
  console.log(`\n  Photo Booth Server Running`);
  console.log(`  Local:   http://localhost:${config.port}`);
  console.log(`  Network: http://${lanIp}:${config.port}`);
  console.log(`  Watch:   ${config.watchFolder}`);
  console.log(`  Event:   ${config.eventName}\n`);
}

function getLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return "localhost";
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
