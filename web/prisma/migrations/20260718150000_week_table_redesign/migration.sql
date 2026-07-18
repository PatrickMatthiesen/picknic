ALTER TYPE "MealType" ADD VALUE 'BRUNCH';
ALTER TYPE "MealType" ADD VALUE 'OTHER';

CREATE TYPE "RecipeVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

ALTER TABLE "Recipe"
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "visibility" "RecipeVisibility" NOT NULL DEFAULT 'PRIVATE',
ADD COLUMN "publishedAt" TIMESTAMP(3);

ALTER TABLE "RecipeIngredient" ADD COLUMN "component" TEXT;

CREATE TABLE "SavedRecipe" (
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedRecipe_pkey" PRIMARY KEY ("userId", "recipeId")
);

CREATE TABLE "RecipeCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecipeCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecipeCollectionItem" (
    "collectionId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "RecipeCollectionItem_pkey" PRIMARY KEY ("collectionId", "recipeId")
);

CREATE INDEX "SavedRecipe_recipeId_idx" ON "SavedRecipe"("recipeId");
CREATE UNIQUE INDEX "RecipeCollection_userId_name_key" ON "RecipeCollection"("userId", "name");
CREATE UNIQUE INDEX "RecipeCollectionItem_collectionId_position_key" ON "RecipeCollectionItem"("collectionId", "position");
CREATE INDEX "RecipeCollectionItem_recipeId_idx" ON "RecipeCollectionItem"("recipeId");

ALTER TABLE "SavedRecipe" ADD CONSTRAINT "SavedRecipe_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedRecipe" ADD CONSTRAINT "SavedRecipe_recipeId_fkey"
FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeCollection" ADD CONSTRAINT "RecipeCollection_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeCollectionItem" ADD CONSTRAINT "RecipeCollectionItem_collectionId_fkey"
FOREIGN KEY ("collectionId") REFERENCES "RecipeCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeCollectionItem" ADD CONSTRAINT "RecipeCollectionItem_recipeId_fkey"
FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
