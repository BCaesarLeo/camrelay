import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  host: z.string().default("0.0.0.0"),
  watchFolder: z.string(),
  storagePath: z.string().default("./storage"),
  jpegQuality: z.coerce.number().min(1).max(100).default(92),
  thumbWidth: z.coerce.number().default(800),
  processingConcurrency: z.coerce.number().min(1).max(8).default(2),
  sessionTimeoutMinutes: z.coerce.number().default(30),
  downloadTokenExpiryHours: z.coerce.number().default(24),
  autoResetSeconds: z.coerce.number().default(60),
  eventName: z.string().default("Photo Booth"),
  wifiNetwork: z.string().optional(),
  wifiPassword: z.string().optional(),
  tunnelUrl: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const raw = {
    port: process.env.PORT,
    host: process.env.HOST,
    watchFolder: process.env.WATCH_FOLDER,
    storagePath: process.env.STORAGE_PATH,
    jpegQuality: process.env.JPEG_QUALITY,
    thumbWidth: process.env.THUMB_WIDTH,
    processingConcurrency: process.env.PROCESSING_CONCURRENCY,
    sessionTimeoutMinutes: process.env.SESSION_TIMEOUT_MINUTES,
    downloadTokenExpiryHours: process.env.DOWNLOAD_TOKEN_EXPIRY_HOURS,
    autoResetSeconds: process.env.AUTO_RESET_SECONDS,
    eventName: process.env.EVENT_NAME,
    wifiNetwork: process.env.WIFI_NETWORK || undefined,
    wifiPassword: process.env.WIFI_PASSWORD || undefined,
    tunnelUrl: process.env.TUNNEL_URL || undefined,
  };

  const config = configSchema.parse(raw);

  // Resolve relative paths
  config.storagePath = path.resolve(config.storagePath);
  config.watchFolder = path.resolve(config.watchFolder);

  return config;
}

export const config = loadConfig();
