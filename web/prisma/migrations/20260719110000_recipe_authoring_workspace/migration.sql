ALTER TABLE "Recipe" ADD COLUMN "totalTimeMinutes" INTEGER;

ALTER TABLE "RecipeIngredient" ADD COLUMN "notes" TEXT;

ALTER TABLE "RecipeStep"
ADD COLUMN "component" TEXT,
ADD COLUMN "durationMinutes" INTEGER,
ADD COLUMN "advanceNotice" BOOLEAN NOT NULL DEFAULT false;
