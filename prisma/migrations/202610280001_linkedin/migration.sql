ALTER TABLE "MailMessage" ADD COLUMN "senderCompany" TEXT;

CREATE TABLE "LinkedinConnection" (
    "id" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "companyKey" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "connectedOn" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LinkedinConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LinkedinConnection_profileUrl_key" ON "LinkedinConnection"("profileUrl");
CREATE INDEX "LinkedinConnection_companyKey_idx" ON "LinkedinConnection"("companyKey");

CREATE TABLE "LinkedinSync" (
    "id" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastSnapshotAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastCounts" JSONB,
    CONSTRAINT "LinkedinSync_pkey" PRIMARY KEY ("id")
);
