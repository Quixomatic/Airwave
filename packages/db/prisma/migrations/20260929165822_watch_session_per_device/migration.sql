/*
  Warnings:

  - A unique constraint covering the columns `[userId,deviceId]` on the table `watch_session` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "watch_session_userId_key";

-- AlterTable
ALTER TABLE "watch_session" ADD COLUMN     "deviceId" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN     "playbackState" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "watch_session_userId_deviceId_key" ON "watch_session"("userId", "deviceId");
