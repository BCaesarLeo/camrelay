import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

const SUPPORTED_RAW_EXTENSIONS = new Set([
  ".nef",
  ".cr2",
  ".cr3",
  ".arw",
  ".orf",
  ".raf",
  ".rw2",
  ".dng",
]);

export function isSupportedRaw(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_RAW_EXTENSIONS.has(ext);
}

export function isSupportedImage(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_RAW_EXTENSIONS.has(ext) || [".jpg", ".jpeg", ".tiff", ".tif", ".png"].includes(ext);
}

export interface ConvertResult {
  fullPath: string;
  thumbPath: string;
  width: number;
  height: number;
  fileSize: number;
}

export async function convertPhoto(
  inputPath: string,
  photoId: string,
  sessionFolder?: string
): Promise<ConvertResult> {
  const base = sessionFolder
    ? path.join(config.storagePath, "sessions", sessionFolder)
    : path.join(config.storagePath, "photos");
  const fullDir = path.join(base, "full");
  const thumbDir = path.join(base, "thumb");

  await fs.mkdir(fullDir, { recursive: true });
  await fs.mkdir(thumbDir, { recursive: true });

  const fullPath = path.join(fullDir, `${photoId}.jpg`);
  const thumbPath = path.join(thumbDir, `${photoId}.jpg`);
  const ext = path.extname(inputPath).toLowerCase();
  const isRaw = SUPPORTED_RAW_EXTENSIONS.has(ext);

  if (isRaw) {
    // Use macOS sips to convert RAW to JPEG
    await execFileAsync("sips", [
      "--setProperty",
      "format",
      "jpeg",
      "--setProperty",
      "formatOptions",
      String(config.jpegQuality),
      inputPath,
      "--out",
      fullPath,
    ]);
  } else {
    // For JPEG/TIFF input, optimize with sharp directly
    await sharp(inputPath)
      .jpeg({ quality: config.jpegQuality, progressive: true, mozjpeg: true })
      .toFile(fullPath);
  }

  // Generate thumbnail from the full-res JPEG
  const thumbInfo = await sharp(fullPath)
    .resize(config.thumbWidth, null, { withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toFile(thumbPath);

  // Get full-res dimensions and file size
  const fullMeta = await sharp(fullPath).metadata();
  const fullStat = await fs.stat(fullPath);

  return {
    fullPath,
    thumbPath,
    width: fullMeta.width ?? thumbInfo.width,
    height: fullMeta.height ?? thumbInfo.height,
    fileSize: fullStat.size,
  };
}
