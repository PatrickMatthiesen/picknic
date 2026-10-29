CREATE TYPE "MealEntryKind" AS ENUM ('RECIPE', 'LEFTOVERS', 'EATING_OUT', 'NOTE', 'NO_PLAN');
ALTER TABLE "MealPlanEntry" ALTER COLUMN "recipeId" DROP NOT NULL;
ALTER TABLE "MealPlanEntry" ADD COLUMN "note" TEXT;
ALTER TABLE "MealPlanEntry" ADD COLUMN "kind" "MealEntryKind" NOT NULL DEFAULT 'RECIPE';
DROP INDEX "MealPlanEntry_mealPlanId_date_mealType_key";
CREATE INDEX "MealPlanEntry_mealPlanId_date_mealType_idx" ON "MealPlanEntry"("mealPlanId", "date", "mealType");
