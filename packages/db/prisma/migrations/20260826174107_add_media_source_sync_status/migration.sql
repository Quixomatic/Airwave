-- AlterTable
ALTER TABLE "media_source" ADD COLUMN     "lastSyncError" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "syncStatus" TEXT NOT NULL DEFAULT 'never';

-- Backfill: an existing source that already has cached media has clearly synced before, so mark it
-- 'synced' on upgrade — otherwise it defaults to 'never' and the (now sync-aware) gate would block
-- channel creation until the next nightly metadata sync runs. A fresh sync later refreshes lastSyncedAt.
UPDATE "media_source" SET "syncStatus" = 'synced'
WHERE EXISTS (SELECT 1 FROM "media_item" WHERE "media_item"."mediaSourceId" = "media_source"."id");
