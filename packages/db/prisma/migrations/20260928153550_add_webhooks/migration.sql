-- CreateTable
CREATE TABLE "webhook" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "eventTypes" TEXT[],
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "disabledAt" TIMESTAMP(3),
    "disabledReason" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseCode" INTEGER,
    "error" TEXT,
    "durationMs" INTEGER,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_delivery_status_nextAttemptAt_idx" ON "webhook_delivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "webhook_delivery_webhookId_createdAt_idx" ON "webhook_delivery"("webhookId", "createdAt");

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
