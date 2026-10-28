import { Prisma } from "@prisma/client";
import { db } from "./db";
import { documentFingerprint } from "./document-version";
import { readProfile } from "./profile";
import { statuses } from "./domain";
export async function changeApplication(
  jobId: string,
  input: {
    status: (typeof statuses)[number];
    eligibilityReviewed?: boolean;
    evidence?: string;
    submittedAt?: string;
    notes?: string;
    followUpAt?: string | null;
    undoSubmission?: boolean;
  },
) {
  const profile = await readProfile();
  // Serializable transaction prevents double submissions and approval races.
  return db.$transaction(
    async (tx) => {
      const job = await tx.job.findUniqueOrThrow({ where: { id: jobId } });
      const current = await tx.application.findUnique({ where: { jobId } });
      const doc = await tx.document.findFirst({
        where: {
          jobId,
          approvedAt: { not: null },
          fingerprint: documentFingerprint(profile.hash, job.contentHash),
          profileHash: profile.hash,
          jobHash: job.contentHash,
        },
      });
      const reviewed =
        input.eligibilityReviewed ?? current?.eligibilityReviewed ?? false;
      if (input.status === "prepared" && !doc)
        throw new Error("Review and approve a current document pack first.");
      if (input.status === "submitted" && !current?.submittedAt) {
        if (!reviewed)
          throw new Error(
            "Confirm that you checked location and work eligibility.",
          );
        if (!input.evidence?.trim())
          throw new Error("Record how you confirmed submission.");
      }
      if (
        [
          "response",
          "assessment",
          "interview",
          "offer",
          "on_hold",
          "rejected",
          "withdrawn",
        ].includes(input.status) &&
        !current?.submittedAt &&
        // A card created from an email has an outcome but may have no known submission date.
        current?.origin !== "email"
      )
        throw new Error(
          "Record the actual submission before updating its outcome.",
        );
      if (
        current?.submittedAt &&
        ["queued", "prepared", "skipped"].includes(input.status) &&
        !input.undoSubmission
      )
        throw new Error(
          "Use the correction action to undo a recorded submission.",
        );
      const submittedAt = input.undoSubmission
        ? null
        : (current?.submittedAt ??
          (input.status === "submitted"
            ? new Date(input.submittedAt ?? new Date())
            : null));
      if (
        submittedAt &&
        (Number.isNaN(submittedAt.valueOf()) || submittedAt > new Date())
      )
        throw new Error("Submission date must be a valid date in the past.");
      const data = {
        status: input.status,
        eligibilityReviewed: reviewed,
        submittedAt,
        ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.followUpAt !== undefined
          ? { followUpAt: input.followUpAt ? new Date(input.followUpAt) : null }
          : {}),
        ...(input.undoSubmission ? { evidence: null } : {}),
      };
      const result = await tx.application.upsert({
        where: { jobId },
        create: { jobId, ...data },
        update: data,
      });
      if (current?.status !== input.status || input.undoSubmission)
        await tx.applicationEvent.create({
          data: {
            applicationId: result.id,
            status: input.status,
            note: input.undoSubmission
              ? "User corrected an incorrectly recorded submission."
              : input.evidence,
          },
        });
      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
