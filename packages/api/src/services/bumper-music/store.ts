import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Filesystem side of the bumper-music library (§7.14). The audio files live in `BUMPER_MUSIC_DIR` (a volume
 * on self-host); the DB (`BumperMusic`) indexes them. This module is the ONLY place that touches those bytes —
 * resolve the dir, validate the format, write uploads, delete, and list what's on disk. No Prisma here.
 *
 * Mirrors the capability-media pattern (`CAP_MEDIA_DIR`, read straight off `process.env` with a sensible
 * default): default `./bumper-music` relative to the server's cwd — `apps/server/bumper-music` in dev,
 * `/app/apps/server/bumper-music` in the container (mount a volume there).
 */

/** Allowed upload/scan formats → their content type. Limited deliberately so it actually plays in the apps. */
export const ALLOWED_AUDIO: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

export const ALLOWED_EXT_LABEL = "mp3, m4a, aac";

/** Absolute path to the music directory (env-overridable, always defaulted). */
export function getMusicDir(): string {
  return path.resolve(process.env.BUMPER_MUSIC_DIR ?? "./bumper-music");
}

/** Create the music dir if it doesn't exist yet (safe to call repeatedly). */
export async function ensureMusicDir(): Promise<void> {
  await mkdir(getMusicDir(), { recursive: true });
}

/** The content type for a filename, or null if it's not an allowed audio format. */
export function contentTypeFor(filename: string): string | null {
  return ALLOWED_AUDIO[path.extname(filename).toLowerCase()] ?? null;
}

export function isAudioFilename(filename: string): boolean {
  return contentTypeFor(filename) !== null;
}

/** Strip any path, keep a safe basename, and make it URL-safe (spaces → dashes, odd chars → underscore). */
function sanitizeFilename(original: string): string {
  const base = path.basename(original).replace(/[/\\]/g, "");
  const ext = path.extname(base).toLowerCase();
  const stem =
    base
      .slice(0, base.length - ext.length)
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w.\-]+/g, "_") || "track";
  return `${stem}${ext}`;
}

/** The absolute path for a stored file — guards against traversal (the name must stay a plain basename). */
export function filePath(filename: string): string {
  const safe = path.basename(filename);
  return path.join(getMusicDir(), safe);
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export function fileExists(filename: string): Promise<boolean> {
  return exists(filePath(filename));
}

/** A filename that doesn't collide in the dir — appends `-2`, `-3`, … before the extension. */
async function uniqueFilename(desired: string): Promise<string> {
  const ext = path.extname(desired);
  const stem = desired.slice(0, desired.length - ext.length);
  let name = desired;
  for (let i = 2; await exists(filePath(name)); i++) name = `${stem}-${i}${ext}`;
  return name;
}

export type StoredFile = { filename: string; contentType: string; sizeBytes: number };

/**
 * Write an uploaded file into the music dir. Rejects non-audio formats; sanitizes + de-collides the name.
 * Returns the final on-disk filename + metadata (for the DB row).
 */
export async function writeUpload(originalName: string, bytes: Uint8Array): Promise<StoredFile> {
  const sanitized = sanitizeFilename(originalName);
  const contentType = contentTypeFor(sanitized);
  if (!contentType) {
    throw new Error(`Unsupported audio format — allowed: ${ALLOWED_EXT_LABEL}`);
  }
  await ensureMusicDir();
  const filename = await uniqueFilename(sanitized);
  await writeFile(filePath(filename), bytes);
  return { filename, contentType, sizeBytes: bytes.byteLength };
}

/** Delete a stored file (no-op if it's already gone). */
export async function deleteFile(filename: string): Promise<void> {
  await unlink(filePath(filename)).catch(() => {});
}

/** Every audio file currently in the dir (basenames). */
export async function listAudioFiles(): Promise<string[]> {
  await ensureMusicDir();
  const entries = await readdir(getMusicDir(), { withFileTypes: true });
  return entries.filter((e) => e.isFile() && isAudioFilename(e.name)).map((e) => e.name);
}

/** Size in bytes of a stored file, or null if it's missing. */
export async function fileSize(filename: string): Promise<number | null> {
  try {
    return (await stat(filePath(filename))).size;
  } catch {
    return null;
  }
}
