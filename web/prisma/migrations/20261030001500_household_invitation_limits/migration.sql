CREATE TABLE "HouseholdInvitationAttempt" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "workosInvitationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  CONSTRAINT "HouseholdInvitationAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HouseholdInvitationAttempt_householdId_createdAt_idx" ON "HouseholdInvitationAttempt"("householdId", "createdAt");
CREATE INDEX "HouseholdInvitationAttempt_requestedById_createdAt_idx" ON "HouseholdInvitationAttempt"("requestedById", "createdAt");
ALTER TABLE "HouseholdInvitationAttempt" ADD CONSTRAINT "HouseholdInvitationAttempt_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdInvitationAttempt" ADD CONSTRAINT "HouseholdInvitationAttempt_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
