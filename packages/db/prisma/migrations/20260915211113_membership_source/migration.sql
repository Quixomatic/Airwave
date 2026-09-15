/*
  Warnings:

  - The values [PLEX_COLLECTION,PLEX_PLAYLIST] on the enum `ChannelDefinitionKind` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `plexCollectionKey` on the `channel_definition` table. All the data in the column will be lost.
  - You are about to drop the column `plexPlaylistKey` on the `channel_definition` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ChannelDefinitionKind_new" AS ENUM ('PREDICATE', 'MEMBERSHIP', 'MANUAL_ITEMS');
ALTER TABLE "channel_definition" ALTER COLUMN "kind" TYPE "ChannelDefinitionKind_new" USING ("kind"::text::"ChannelDefinitionKind_new");
ALTER TYPE "ChannelDefinitionKind" RENAME TO "ChannelDefinitionKind_old";
ALTER TYPE "ChannelDefinitionKind_new" RENAME TO "ChannelDefinitionKind";
DROP TYPE "public"."ChannelDefinitionKind_old";
COMMIT;

-- AlterTable
ALTER TABLE "channel_definition" DROP COLUMN "plexCollectionKey",
DROP COLUMN "plexPlaylistKey",
ADD COLUMN     "sources" JSONB;
