-- CreateTable
CREATE TABLE "CookLog" (
    "householdId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "recipeId" TEXT NOT NULL,
    "recipeRevisionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "swappedAt" TIMESTAMP(3),

    CONSTRAINT "CookLog_pkey" PRIMARY KEY ("householdId","date","recipeId")
);

-- AddForeignKey
ALTER TABLE "CookLog" ADD CONSTRAINT "CookLog_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookLog" ADD CONSTRAINT "CookLog_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookLog" ADD CONSTRAINT "CookLog_recipeRevisionId_fkey" FOREIGN KEY ("recipeRevisionId") REFERENCES "RecipeRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
