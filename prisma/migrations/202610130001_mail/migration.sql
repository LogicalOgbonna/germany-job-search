-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "lastMailAt" TIMESTAMP(3),
ADD COLUMN     "nextStep" TEXT,
ADD COLUMN     "nextStepDueAt" TIMESTAMP(3),
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'jobdesk';

-- AlterTable
ALTER TABLE "ApplicationEvent" ADD COLUMN     "mailMessageId" TEXT,
ADD COLUMN     "previous" JSONB;

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL,
    "gmailId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "bodyText" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "evidenceQuote" TEXT,
    "company" TEXT,
    "role" TEXT,
    "nextStep" TEXT,
    "deadline" TIMESTAMP(3),
    "applicationId" TEXT,
    "matchReason" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL,
    "proposal" JSONB,
    "correctedFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailSync" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastCounts" JSONB,

    CONSTRAINT "MailSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailMessage_gmailId_key" ON "MailMessage"("gmailId");

-- CreateIndex
CREATE INDEX "MailMessage_threadId_idx" ON "MailMessage"("threadId");

-- CreateIndex
CREATE INDEX "MailMessage_state_receivedAt_idx" ON "MailMessage"("state", "receivedAt");

-- CreateIndex
CREATE INDEX "MailMessage_applicationId_idx" ON "MailMessage"("applicationId");

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_mailMessageId_fkey" FOREIGN KEY ("mailMessageId") REFERENCES "MailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

