-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BumperSource" AS ENUM ('PLEX_PLAYLIST', 'PLEX_COLLECTION', 'LOCAL_DIR');

-- CreateEnum
CREATE TYPE "BumperPlacement" AS ENUM ('BETWEEN_PROGRAMS', 'MID_PROGRAM');

-- CreateEnum
CREATE TYPE "OrderingStrategy" AS ENUM ('SHUFFLE', 'IN_ORDER', 'BY_AIR_DATE');

-- CreateEnum
CREATE TYPE "ChannelDefinitionKind" AS ENUM ('PREDICATE', 'PLEX_COLLECTION', 'PLEX_PLAYLIST', 'MANUAL_ITEMS');

-- CreateEnum
CREATE TYPE "DefinitionMode" AS ENUM ('INCLUDE', 'EXCLUDE');

-- CreateEnum
CREATE TYPE "BumperMode" AS ENUM ('INHERIT', 'OFF', 'INTERSTITIAL_ONLY', 'FULL');

-- CreateEnum
CREATE TYPE "MediaSourceType" AS ENUM ('PLEX', 'JELLYFIN', 'EMBY');

-- CreateEnum
CREATE TYPE "ScheduleItemKind" AS ENUM ('PROGRAM', 'BUMPER');

-- CreateTable
CREATE TABLE "ai_connection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "baseUrl" TEXT,
    "apiKeyEnc" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isPlanner" BOOLEAN NOT NULL DEFAULT false,
    "isWorker" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_lineup_trace" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "stepName" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "phase" TEXT NOT NULL,
    "channelKey" TEXT,
    "channelNumber" INTEGER,
    "channelName" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "input" JSONB,
    "output" JSONB,
    "trace" JSONB,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "agentSteps" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ai_lineup_trace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT,
    "banned" BOOLEAN,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_code" (
    "id" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastPolledAt" TIMESTAMP(3),
    "pollingInterval" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bumper_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "interstitialSeconds" INTEGER NOT NULL DEFAULT 15,
    "afterMovieSeconds" INTEGER NOT NULL DEFAULT 120,
    "afterEpisodeSeconds" INTEGER NOT NULL DEFAULT 30,
    "quickSeconds" INTEGER NOT NULL DEFAULT 10,
    "shortEpisodeMinutes" INTEGER NOT NULL DEFAULT 20,
    "interstitialStyle" TEXT NOT NULL DEFAULT 'up-next',
    "interstitialMusicKey" TEXT,
    "source" "BumperSource",
    "plexPlaylistKey" TEXT,
    "plexCollectionKey" TEXT,
    "localDirPath" TEXT,
    "minPerBreak" INTEGER NOT NULL DEFAULT 1,
    "maxPerBreak" INTEGER NOT NULL DEFAULT 1,
    "placement" "BumperPlacement" NOT NULL DEFAULT 'BETWEEN_PROGRAMS',
    "midProgramCadenceMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bumper_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_package" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "tint" TEXT,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "generated" BOOLEAN NOT NULL DEFAULT false,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "callsign" TEXT,
    "description" TEXT,
    "icon" TEXT,
    "tint" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "ordering" "OrderingStrategy" NOT NULL DEFAULT 'SHUFFLE',
    "shuffleSeed" INTEGER,
    "sortField" TEXT NOT NULL DEFAULT 'title',
    "sortDir" TEXT NOT NULL DEFAULT 'asc',
    "generated" BOOLEAN NOT NULL DEFAULT false,
    "presetKey" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "schedulePassSeed" INTEGER NOT NULL DEFAULT 0,
    "schedulePassIndex" INTEGER NOT NULL DEFAULT 0,
    "schedulePassPos" INTEGER NOT NULL DEFAULT 0,
    "bumperMode" "BumperMode" NOT NULL DEFAULT 'INHERIT',
    "bumperRev" INTEGER NOT NULL DEFAULT 0,
    "mediaSourceId" TEXT NOT NULL,
    "packageId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_definition" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" "ChannelDefinitionKind" NOT NULL,
    "mode" "DefinitionMode" NOT NULL DEFAULT 'INCLUDE',
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "plexFilter" JSONB,
    "plexLibraryKey" TEXT,
    "plexCollectionKey" TEXT,
    "plexPlaylistKey" TEXT,
    "manualItemKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_capability" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT,
    "testId" TEXT NOT NULL,
    "container" TEXT,
    "video" TEXT,
    "audio" TEXT,
    "feature" TEXT,
    "subtitle" TEXT,
    "decoded" BOOLEAN,
    "decodedWidth" INTEGER,
    "decodedHeight" INTEGER,
    "droppedFrames" INTEGER,
    "totalFrames" INTEGER,
    "error" TEXT,
    "audioOk" BOOLEAN,
    "hdrOk" BOOLEAN,
    "subtitleOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "cronSchedule" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_source" (
    "id" TEXT NOT NULL,
    "type" "MediaSourceType" NOT NULL DEFAULT 'PLEX',
    "name" TEXT NOT NULL,
    "baseUrl" TEXT,
    "machineIdentifier" TEXT,
    "token" TEXT NOT NULL,
    "clientIdentifier" TEXT,
    "webAppUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_item" (
    "id" TEXT NOT NULL,
    "mediaSourceId" TEXT NOT NULL,
    "ratingKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "year" INTEGER,
    "airDate" TEXT,
    "parentId" TEXT,
    "guide" JSONB NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_library" (
    "id" TEXT NOT NULL,
    "mediaSourceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastScanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playback_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "channelId" TEXT,
    "channelName" TEXT,
    "ratingKey" TEXT,
    "title" TEXT,
    "mode" TEXT,
    "sourceContainer" TEXT,
    "sourceVideoCodec" TEXT,
    "sourceAudioCodec" TEXT,
    "decision" JSONB,
    "caps" JSONB,
    "outcome" TEXT,
    "decodedWidth" INTEGER,
    "decodedHeight" INTEGER,
    "readyState" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playback_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_item" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" "ScheduleItemKind" NOT NULL DEFAULT 'PROGRAM',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "startOffsetSeconds" INTEGER NOT NULL DEFAULT 0,
    "ratingKey" TEXT,
    "bumperKind" TEXT,
    "mediaItemId" TEXT,
    "targetMediaItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tv_device" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "platform" TEXT,
    "model" TEXT,
    "osVersion" TEXT,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "pixelRatio" DOUBLE PRECISION,
    "hdr" BOOLEAN,
    "colorGamut" TEXT,
    "capabilities" JSONB,
    "raw" JSONB,
    "capabilityOverrides" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_watch_state" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "atLiveEdge" BOOLEAN NOT NULL DEFAULT true,
    "positionAt" TIMESTAMP(3),
    "lastRatingKey" TEXT,
    "lastOffsetSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_watch_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'off',
    "ratingKey" TEXT,
    "title" TEXT,
    "delaySeconds" INTEGER NOT NULL DEFAULT 0,
    "positionAt" TIMESTAMP(3),
    "transcodeSession" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_connection_isActive_idx" ON "ai_connection"("isActive");

-- CreateIndex
CREATE INDEX "ai_connection_isPlanner_idx" ON "ai_connection"("isPlanner");

-- CreateIndex
CREATE INDEX "ai_connection_isWorker_idx" ON "ai_connection"("isWorker");

-- CreateIndex
CREATE INDEX "ai_lineup_trace_runId_idx" ON "ai_lineup_trace"("runId");

-- CreateIndex
CREATE INDEX "ai_lineup_trace_runId_phase_idx" ON "ai_lineup_trace"("runId", "phase");

-- CreateIndex
CREATE INDEX "ai_conversation_userId_idx" ON "ai_conversation"("userId");

-- CreateIndex
CREATE INDEX "ai_conversation_updatedAt_idx" ON "ai_conversation"("updatedAt");

-- CreateIndex
CREATE INDEX "ai_message_conversationId_idx" ON "ai_message"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "device_code_deviceCode_key" ON "device_code"("deviceCode");

-- CreateIndex
CREATE UNIQUE INDEX "device_code_userCode_key" ON "device_code"("userCode");

-- CreateIndex
CREATE UNIQUE INDEX "bumper_config_key_key" ON "bumper_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "channel_package_key_key" ON "channel_package"("key");

-- CreateIndex
CREATE UNIQUE INDEX "channel_number_key" ON "channel"("number");

-- CreateIndex
CREATE INDEX "channel_packageId_idx" ON "channel"("packageId");

-- CreateIndex
CREATE INDEX "channel_mediaSourceId_idx" ON "channel"("mediaSourceId");

-- CreateIndex
CREATE INDEX "channel_definition_channelId_idx" ON "channel_definition"("channelId");

-- CreateIndex
CREATE INDEX "device_capability_deviceId_idx" ON "device_capability"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "device_capability_deviceId_testId_key" ON "device_capability"("deviceId", "testId");

-- CreateIndex
CREATE INDEX "media_source_ownerUserId_idx" ON "media_source"("ownerUserId");

-- CreateIndex
CREATE INDEX "media_item_mediaSourceId_type_idx" ON "media_item"("mediaSourceId", "type");

-- CreateIndex
CREATE INDEX "media_item_parentId_idx" ON "media_item"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "media_item_mediaSourceId_ratingKey_key" ON "media_item"("mediaSourceId", "ratingKey");

-- CreateIndex
CREATE INDEX "media_library_mediaSourceId_idx" ON "media_library"("mediaSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "media_library_mediaSourceId_key_key" ON "media_library"("mediaSourceId", "key");

-- CreateIndex
CREATE INDEX "playback_log_userId_idx" ON "playback_log"("userId");

-- CreateIndex
CREATE INDEX "playback_log_channelId_idx" ON "playback_log"("channelId");

-- CreateIndex
CREATE INDEX "playback_log_createdAt_idx" ON "playback_log"("createdAt");

-- CreateIndex
CREATE INDEX "schedule_item_channelId_startsAt_idx" ON "schedule_item"("channelId", "startsAt");

-- CreateIndex
CREATE INDEX "schedule_item_channelId_kind_idx" ON "schedule_item"("channelId", "kind");

-- CreateIndex
CREATE INDEX "schedule_item_mediaItemId_idx" ON "schedule_item"("mediaItemId");

-- CreateIndex
CREATE UNIQUE INDEX "tv_device_deviceId_key" ON "tv_device"("deviceId");

-- CreateIndex
CREATE INDEX "tv_device_userId_idx" ON "tv_device"("userId");

-- CreateIndex
CREATE INDEX "favorite_userId_idx" ON "favorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_userId_channelId_key" ON "favorite"("userId", "channelId");

-- CreateIndex
CREATE INDEX "channel_watch_state_userId_idx" ON "channel_watch_state"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_watch_state_userId_channelId_key" ON "channel_watch_state"("userId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "watch_session_userId_key" ON "watch_session"("userId");

-- CreateIndex
CREATE INDEX "watch_session_channelId_idx" ON "watch_session"("channelId");

-- CreateIndex
CREATE INDEX "watch_session_lastHeartbeatAt_idx" ON "watch_session"("lastHeartbeatAt");

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_code" ADD CONSTRAINT "device_code_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel" ADD CONSTRAINT "channel_mediaSourceId_fkey" FOREIGN KEY ("mediaSourceId") REFERENCES "media_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel" ADD CONSTRAINT "channel_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "channel_package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel" ADD CONSTRAINT "channel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_definition" ADD CONSTRAINT "channel_definition_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_source" ADD CONSTRAINT "media_source_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_item" ADD CONSTRAINT "media_item_mediaSourceId_fkey" FOREIGN KEY ("mediaSourceId") REFERENCES "media_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_item" ADD CONSTRAINT "media_item_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "media_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_library" ADD CONSTRAINT "media_library_mediaSourceId_fkey" FOREIGN KEY ("mediaSourceId") REFERENCES "media_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playback_log" ADD CONSTRAINT "playback_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_item" ADD CONSTRAINT "schedule_item_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_item" ADD CONSTRAINT "schedule_item_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "media_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_item" ADD CONSTRAINT "schedule_item_targetMediaItemId_fkey" FOREIGN KEY ("targetMediaItemId") REFERENCES "media_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tv_device" ADD CONSTRAINT "tv_device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_watch_state" ADD CONSTRAINT "channel_watch_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_watch_state" ADD CONSTRAINT "channel_watch_state_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_session" ADD CONSTRAINT "watch_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_session" ADD CONSTRAINT "watch_session_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
