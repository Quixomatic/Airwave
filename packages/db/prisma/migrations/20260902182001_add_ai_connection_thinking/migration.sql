-- AlterTable
ALTER TABLE "ai_connection" ADD COLUMN     "disableThinking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "extraBody" JSONB;
