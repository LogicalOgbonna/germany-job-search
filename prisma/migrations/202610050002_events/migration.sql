-- CreateTable
CREATE TABLE "TechEvent" (
    "id" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "topics" TEXT[],
    "score" INTEGER NOT NULL,
    "reasons" TEXT[],
    "cost" TEXT NOT NULL DEFAULT 'Price not published',
    "free" BOOLEAN NOT NULL DEFAULT false,
    "eligibility" TEXT NOT NULL DEFAULT 'Check the organizer''s participation requirements.',
    "status" TEXT NOT NULL DEFAULT 'listed',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 720,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "leaseUntil" TIMESTAMP(3),

    CONSTRAINT "EventSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventListing" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSourceRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,

    CONSTRAINT "EventSourceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPlan" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'saved',
    "notes" TEXT NOT NULL DEFAULT '',
    "contactsMet" INTEGER NOT NULL DEFAULT 0,
    "followUpAt" TIMESTAMP(3),
    "followUpDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TechEvent_canonicalKey_key" ON "TechEvent"("canonicalKey");

-- CreateIndex
CREATE INDEX "TechEvent_startsAt_score_idx" ON "TechEvent"("startsAt", "score");

-- CreateIndex
CREATE UNIQUE INDEX "EventSource_key_key" ON "EventSource"("key");

-- CreateIndex
CREATE UNIQUE INDEX "EventListing_sourceId_externalId_key" ON "EventListing"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "EventSourceRun_startedAt_idx" ON "EventSourceRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventPlan_eventId_key" ON "EventPlan"("eventId");

-- AddForeignKey
ALTER TABLE "EventListing" ADD CONSTRAINT "EventListing_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EventSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventListing" ADD CONSTRAINT "EventListing_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TechEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSourceRun" ADD CONSTRAINT "EventSourceRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EventSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPlan" ADD CONSTRAINT "EventPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TechEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

