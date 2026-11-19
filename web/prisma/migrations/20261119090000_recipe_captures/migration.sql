CREATE TYPE "RecipeCaptureStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "RecipeCapture" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "status" "RecipeCaptureStatus" NOT NULL DEFAULT 'PENDING',
    "draft" JSONB,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "savedRecipeId" TEXT,
    "attemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeCapture_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecipeCapturePhoto" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "RecipeCapturePhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecipeCapture_savedRecipeId_key" ON "RecipeCapture"("savedRecipeId");
CREATE INDEX "RecipeCapture_userId_householdId_createdAt_idx" ON "RecipeCapture"("userId", "householdId", "createdAt");
CREATE UNIQUE INDEX "RecipeCapturePhoto_captureId_position_key" ON "RecipeCapturePhoto"("captureId", "position");

ALTER TABLE "RecipeCapture" ADD CONSTRAINT "RecipeCapture_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeCapture" ADD CONSTRAINT "RecipeCapture_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeCapture" ADD CONSTRAINT "RecipeCapture_savedRecipeId_fkey" FOREIGN KEY ("savedRecipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecipeCapturePhoto" ADD CONSTRAINT "RecipeCapturePhoto_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "RecipeCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
