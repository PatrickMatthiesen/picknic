CREATE TABLE "MealPlanTemplate" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MealPlanTemplate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MealPlanTemplateEntry" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "dayOffset" INTEGER NOT NULL,
  "mealType" "MealType" NOT NULL,
  "kind" "MealEntryKind" NOT NULL DEFAULT 'RECIPE',
  "recipeId" TEXT,
  "recipeRevisionId" TEXT,
  "note" TEXT,
  "servingsOverride" INTEGER,
  CONSTRAINT "MealPlanTemplateEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MealPlanTemplate_householdId_name_key" ON "MealPlanTemplate"("householdId", "name");
CREATE INDEX "MealPlanTemplateEntry_templateId_dayOffset_mealType_idx" ON "MealPlanTemplateEntry"("templateId", "dayOffset", "mealType");
ALTER TABLE "MealPlanTemplate" ADD CONSTRAINT "MealPlanTemplate_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealPlanTemplate" ADD CONSTRAINT "MealPlanTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MealPlanTemplateEntry" ADD CONSTRAINT "MealPlanTemplateEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MealPlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
