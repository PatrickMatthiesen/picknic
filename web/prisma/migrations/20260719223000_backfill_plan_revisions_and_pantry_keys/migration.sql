ALTER TABLE "PantryItem" ADD COLUMN "unitKey" TEXT;

UPDATE "PantryItem"
SET "unitKey" = COALESCE("unitId", 'legacy:' || lower(trim("unit")));

ALTER TABLE "PantryItem" ALTER COLUMN "unitKey" SET NOT NULL;
DROP INDEX "PantryItem_householdId_ingredientName_unit_key";
CREATE UNIQUE INDEX "PantryItem_householdId_ingredientName_unitKey_key"
ON "PantryItem"("householdId", "ingredientName", "unitKey");

INSERT INTO "RecipeRevision" (
    "id",
    "recipeId",
    "publishedById",
    "version",
    "snapshot",
    "createdAt"
)
SELECT
    'backfill-revision-' || md5(recipe."id"),
    recipe."id",
    recipe."createdById",
    COALESCE((
        SELECT max(existing."version")
        FROM "RecipeRevision" existing
        WHERE existing."recipeId" = recipe."id"
    ), 0) + 1,
    jsonb_build_object(
        'recipeId', recipe."id",
        'title', recipe."title",
        'description', recipe."description",
        'servings', recipe."servings",
        'totalTimeMinutes', recipe."totalTimeMinutes",
        'tags', to_jsonb(recipe."tags"),
        'imageUrl', recipe."imageUrl",
        'visibility', recipe."visibility"::text,
        'authorName', COALESCE(NULLIF(trim(author."displayName"), ''), 'Picknic cook'),
        'ingredients', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', ingredient."id",
                'name', ingredient."name",
                'quantity', ingredient."quantity",
                'unit', ingredient."unit",
                'unitId', ingredient."unitId",
                'notes', ingredient."notes",
                'component', ingredient."component",
                'componentId', ingredient."componentId",
                'componentPosition', ingredient."componentPosition",
                'position', ingredient."position"
            ) ORDER BY ingredient."position")
            FROM "RecipeIngredient" ingredient
            WHERE ingredient."recipeId" = recipe."id"
        ), '[]'::jsonb),
        'steps', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', step."id",
                'instruction', step."instruction",
                'component', step."component",
                'componentId', step."componentId",
                'componentPosition', step."componentPosition",
                'durationMinutes', step."durationMinutes",
                'advanceNotice', step."advanceNotice",
                'position', step."position"
            ) ORDER BY step."position")
            FROM "RecipeStep" step
            WHERE step."recipeId" = recipe."id"
        ), '[]'::jsonb)
    ),
    CURRENT_TIMESTAMP
FROM "Recipe" recipe
JOIN "User" author ON author."id" = recipe."createdById"
WHERE EXISTS (
    SELECT 1
    FROM "MealPlanEntry" entry
    WHERE entry."recipeId" = recipe."id"
      AND entry."recipeRevisionId" IS NULL
)
OR EXISTS (
    SELECT 1
    FROM "SavedRecipe" saved
    WHERE saved."recipeId" = recipe."id"
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "MealPlanEntry" entry
SET "recipeRevisionId" = 'backfill-revision-' || md5(entry."recipeId")
WHERE entry."recipeRevisionId" IS NULL;

UPDATE "Recipe" recipe
SET "latestRevisionId" = 'backfill-revision-' || md5(recipe."id")
WHERE recipe."latestRevisionId" IS NULL
  AND (
      recipe."visibility" = 'PUBLIC'
      OR EXISTS (
          SELECT 1
          FROM "SavedRecipe" saved
          WHERE saved."recipeId" = recipe."id"
      )
  )
  AND EXISTS (
      SELECT 1
      FROM "RecipeRevision" revision
      WHERE revision."id" = 'backfill-revision-' || md5(recipe."id")
  );
