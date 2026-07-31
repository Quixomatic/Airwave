import path from "node:path";

import type { PrismaClient } from "@ChannelGuide/db";

import {
  contentTypeFor,
  deleteFile,
  fileExists,
  fileSize,
  listAudioFiles,
  writeUpload,
} from "./store";

/**
 * DB + orchestration for the bumper-music library (§7.14). Wraps the filesystem `store` with the `BumperMusic`
 * table: list, upload, toggle, rename, delete, and the folder scan. The audio bytes never leave `store`.
 */

const titleFromFilename = (filename: string) => path.basename(filename, path.extname(filename));

/** All tracks, newest first — for the admin library panel. */
export function listMusic(prisma: PrismaClient) {
  return prisma.bumperMusic.findMany({ orderBy: { createdAt: "desc" } });
}

/** Enabled, present tracks — what a viewer's client picks from (id + title + stream url). */
export async function listEnabledMusic(prisma: PrismaClient) {
  const rows = await prisma.bumperMusic.findMany({
    where: { enabled: true, missing: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, filename: true },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, url: `/bumper-music/${encodeURIComponent(r.filename)}` }));
}

/** Write an uploaded file to the dir + index it. Enabled by default (goes straight into the pool). */
export async function createFromUpload(prisma: PrismaClient, originalName: string, bytes: Uint8Array) {
  const stored = await writeUpload(originalName, bytes);
  return prisma.bumperMusic.create({
    data: {
      filename: stored.filename,
      title: titleFromFilename(stored.filename),
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      source: "upload",
    },
  });
}

export function setMusicEnabled(prisma: PrismaClient, id: string, enabled: boolean) {
  return prisma.bumperMusic.update({ where: { id }, data: { enabled } });
}

export function renameMusic(prisma: PrismaClient, id: string, title: string) {
  return prisma.bumperMusic.update({ where: { id }, data: { title: title.trim() || "Untitled" } });
}

/** Remove a track's row, and (default) its file — leaving the file lets the scan re-add it. */
export async function removeMusic(prisma: PrismaClient, id: string, deleteFileToo = true) {
  const row = await prisma.bumperMusic.findUnique({ where: { id }, select: { filename: true } });
  if (!row) return { removed: false };
  await prisma.bumperMusic.delete({ where: { id } });
  if (deleteFileToo) await deleteFile(row.filename);
  return { removed: true };
}

/**
 * Reconcile the DB index with what's actually in the dir — the manual `bumper-music-scan` job. Indexes audio
 * files dropped straight into the volume (creates rows, `source: "scan"`, enabled), flags rows whose file has
 * vanished (`missing: true`, kept not deleted), and clears the flag on any that reappeared.
 */
export async function scanMusicDir(prisma: PrismaClient): Promise<{ added: number; missing: number; total: number }> {
  const [files, rows] = await Promise.all([listAudioFiles(), prisma.bumperMusic.findMany()]);
  const onDisk = new Set(files);
  const indexed = new Map(rows.map((r) => [r.filename, r]));

  let added = 0;
  for (const filename of files) {
    if (indexed.has(filename)) continue;
    await prisma.bumperMusic.create({
      data: {
        filename,
        title: titleFromFilename(filename),
        contentType: contentTypeFor(filename),
        sizeBytes: await fileSize(filename),
        source: "scan",
      },
    });
    added++;
  }

  let missing = 0;
  for (const row of rows) {
    const present = onDisk.has(row.filename) || (await fileExists(row.filename));
    if (!present && !row.missing) {
      await prisma.bumperMusic.update({ where: { id: row.id }, data: { missing: true } });
      missing++;
    } else if (present && row.missing) {
      await prisma.bumperMusic.update({ where: { id: row.id }, data: { missing: false } });
    }
  }

  return { added, missing, total: await prisma.bumperMusic.count() };
}
