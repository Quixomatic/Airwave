-- AlterTable
ALTER TABLE "media_item" ADD COLUMN     "imdbId" TEXT,
ADD COLUMN     "tmdbId" TEXT,
ADD COLUMN     "tvdbId" TEXT;

-- CreateIndex
CREATE INDEX "media_item_mediaSourceId_tmdbId_idx" ON "media_item"("mediaSourceId", "tmdbId");

-- CreateIndex
CREATE INDEX "media_item_mediaSourceId_tvdbId_idx" ON "media_item"("mediaSourceId", "tvdbId");

-- CreateIndex
CREATE INDEX "media_item_mediaSourceId_imdbId_idx" ON "media_item"("mediaSourceId", "imdbId");
