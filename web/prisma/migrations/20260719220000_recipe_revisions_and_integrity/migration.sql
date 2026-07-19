ALTER TABLE "Recipe"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "latestRevisionId" TEXT,
ADD COLUMN "sourceRecipeId" TEXT,
ADD COLUMN "sourceRevisionId" TEXT,
ADD COLUMN "sourceAuthorId" TEXT,
ADD COLUMN "sourceAuthorName" TEXT;

ALTER TABLE "RecipeIngredient"
ADD COLUMN "componentId" TEXT,
ADD COLUMN "componentPosition" INTEGER;

ALTER TABLE "RecipeStep"
ADD COLUMN "componentId" TEXT,
ADD COLUMN "componentPosition" INTEGER;

ALTER TABLE "SavedRecipe" ADD COLUMN "lastSeenRevisionId" TEXT;

ALTER TABLE "MealPlanEntry" ADD COLUMN "recipeRevisionId" TEXT;

ALTER TABLE "ShoppingListItem" ADD COLUMN "unitId" TEXT;

ALTER TABLE "PantryItem" ADD COLUMN "unitId" TEXT;

CREATE TABLE "RecipeRevision" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "publishedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecipeRevision_recipeId_version_key" ON "RecipeRevision"("recipeId", "version");
CREATE INDEX "RecipeRevision_recipeId_createdAt_idx" ON "RecipeRevision"("recipeId", "createdAt");
CREATE INDEX "Recipe_sourceRecipeId_idx" ON "Recipe"("sourceRecipeId");
CREATE INDEX "PantryItem_householdId_ingredientName_unitId_idx" ON "PantryItem"("householdId", "ingredientName", "unitId");
DROP INDEX "RecipeCollectionItem_collectionId_position_key";
CREATE INDEX "RecipeCollectionItem_collectionId_position_idx" ON "RecipeCollectionItem"("collectionId", "position");

ALTER TABLE "RecipeRevision" ADD CONSTRAINT "RecipeRevision_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeRevision" ADD CONSTRAINT "RecipeRevision_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MealPlanEntry" ADD CONSTRAINT "MealPlanEntry_recipeRevisionId_fkey" FOREIGN KEY ("recipeRevisionId") REFERENCES "RecipeRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
