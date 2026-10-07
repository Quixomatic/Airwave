-- AlterTable
ALTER TABLE "media_library" ADD COLUMN     "autoDisabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "missingPolls" INTEGER NOT NULL DEFAULT 0;
