-- CreateTable
CREATE TABLE "import_trace" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "stepName" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "phase" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "packageKey" TEXT,
    "channelName" TEXT,
    "channelNumber" INTEGER,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "poolSize" INTEGER,
    "scheduleSlots" INTEGER,
    "numberReassigned" BOOLEAN NOT NULL DEFAULT false,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "import_trace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_trace_runId_idx" ON "import_trace"("runId");

-- CreateIndex
CREATE INDEX "import_trace_runId_phase_idx" ON "import_trace"("runId", "phase");
