-- A user can have at most one personal household. Organization-backed
-- households continue to use workosOrganizationId as their unique identity.
ALTER TABLE "Household" ADD COLUMN "personalForUserId" TEXT;

WITH ranked_personal_households AS (
  SELECT
    "id",
    "ownerId",
    ROW_NUMBER() OVER (PARTITION BY "ownerId" ORDER BY "createdAt", "id") AS position
  FROM "Household"
  WHERE "workosOrganizationId" IS NULL
)
UPDATE "Household" AS household
SET "personalForUserId" = ranked."ownerId"
FROM ranked_personal_households AS ranked
WHERE household."id" = ranked."id" AND ranked.position = 1;

CREATE UNIQUE INDEX "Household_personalForUserId_key"
ON "Household"("personalForUserId");

ALTER TABLE "Household"
ADD CONSTRAINT "Household_personalForUserId_fkey"
FOREIGN KEY ("personalForUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
