-- CreateTable
CREATE TABLE "remote_access" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cloudBaseUrl" TEXT NOT NULL DEFAULT 'https://api.airwave.software',
    "registrationToken" TEXT,
    "bindSecret" TEXT,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "subdomain" TEXT,
    "tunnelSecret" TEXT,
    "relayHost" TEXT,
    "hostname" TEXT,
    "lastPolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remote_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "remote_access_key_key" ON "remote_access"("key");
