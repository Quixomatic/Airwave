-- AlterTable
ALTER TABLE "bumper_config" ADD COLUMN     "musicEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "musicFadeInMs" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "musicFadeOutMs" INTEGER NOT NULL DEFAULT 1500,
ADD COLUMN     "musicVolume" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "bumper_music" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "missing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bumper_music_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bumper_music_filename_key" ON "bumper_music"("filename");
