-- CreateTable
CREATE TABLE "ReferralSearch" (
    "jobId" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT '',
    "lastRunAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "report" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ReferralSearch_pkey" PRIMARY KEY ("jobId")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "linkedin" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceNote" TEXT NOT NULL DEFAULT '',
    "emailStatus" TEXT NOT NULL DEFAULT 'Not verified',
    "employmentReviewed" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'saved',
    "notes" TEXT NOT NULL DEFAULT '',
    "followUpAt" TIMESTAMP(3),
    "contactedAt" TIMESTAMP(3),
    "drafts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Referral_email_idx" ON "Referral"("email");

-- CreateIndex
CREATE INDEX "Referral_linkedin_idx" ON "Referral"("linkedin");

-- CreateIndex
CREATE INDEX "Referral_status_followUpAt_idx" ON "Referral"("status", "followUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_jobId_identity_key" ON "Referral"("jobId", "identity");

-- AddForeignKey
ALTER TABLE "ReferralSearch" ADD CONSTRAINT "ReferralSearch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

