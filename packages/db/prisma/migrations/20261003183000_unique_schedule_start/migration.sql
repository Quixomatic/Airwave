-- Existing schedule races may have inserted exact duplicates. Keep the oldest
-- row at each channel timestamp so the uniqueness backstop can be installed.
WITH "duplicate_schedule_items" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "channelId", "startsAt"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "duplicate_number"
  FROM "schedule_item"
)
DELETE FROM "schedule_item"
USING "duplicate_schedule_items"
WHERE "schedule_item"."id" = "duplicate_schedule_items"."id"
  AND "duplicate_schedule_items"."duplicate_number" > 1;

-- Replace the ordinary lookup index with a unique index over the same columns.
DROP INDEX "schedule_item_channelId_startsAt_idx";
CREATE UNIQUE INDEX "schedule_item_channelId_startsAt_key"
  ON "schedule_item"("channelId", "startsAt");
