-- AlterTable
ALTER TABLE "channel" ADD COLUMN     "presetRev" TEXT;

-- CreateTable
CREATE TABLE "preset_run" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "userId" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "selection" JSONB NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "deleted" INTEGER NOT NULL DEFAULT 0,
    "skipped" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "preset_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preset_run_trace" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "packageKey" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "channelKey" TEXT,
    "channelName" TEXT,
    "channelNumber" INTEGER,
    "kind" TEXT NOT NULL,
    "op" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "itemCount" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "preset_run_trace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preset_run_status_idx" ON "preset_run"("status");

-- CreateIndex
CREATE INDEX "preset_run_sourceId_idx" ON "preset_run"("sourceId");

-- CreateIndex
CREATE INDEX "preset_run_startedAt_idx" ON "preset_run"("startedAt");

-- CreateIndex
CREATE INDEX "preset_run_trace_runId_idx" ON "preset_run_trace"("runId");

-- CreateIndex
CREATE INDEX "preset_run_trace_runId_packageKey_idx" ON "preset_run_trace"("runId", "packageKey");

-- AddForeignKey
ALTER TABLE "preset_run_trace" ADD CONSTRAINT "preset_run_trace_runId_fkey" FOREIGN KEY ("runId") REFERENCES "preset_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
