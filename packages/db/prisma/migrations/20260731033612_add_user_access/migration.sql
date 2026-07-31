-- CreateEnum
CREATE TYPE "PackageAccessMode" AS ENUM ('FULL', 'PARTIAL');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "allAccess" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "user_package_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "mode" "PackageAccessMode" NOT NULL DEFAULT 'FULL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_package_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_channel_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_channel_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_package_access_userId_idx" ON "user_package_access"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_package_access_userId_packageId_key" ON "user_package_access"("userId", "packageId");

-- CreateIndex
CREATE INDEX "user_channel_access_userId_idx" ON "user_channel_access"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_channel_access_userId_channelId_key" ON "user_channel_access"("userId", "channelId");

-- AddForeignKey
ALTER TABLE "user_package_access" ADD CONSTRAINT "user_package_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_package_access" ADD CONSTRAINT "user_package_access_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "channel_package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_channel_access" ADD CONSTRAINT "user_channel_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_channel_access" ADD CONSTRAINT "user_channel_access_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
