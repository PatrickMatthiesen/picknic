CREATE TEMP TABLE "PantryUnitNormalization" AS
WITH normalized AS (
    SELECT
        pantry."id",
        lower(regexp_replace(replace(trim(pantry."unit"), '.', ''), '\s+', ' ', 'g')) AS alias
    FROM "PantryItem" pantry
), resolved AS (
    SELECT
        normalized."id",
        normalized.alias,
        CASE
            WHEN normalized.alias IN ('mg', 'milligram', 'milligrams') THEN 'metric-milligram'
            WHEN normalized.alias IN ('g', 'gr', 'gram', 'grams', 'gramme', 'grammes') THEN 'metric-gram'
            WHEN normalized.alias IN ('kg', 'kilo', 'kilos', 'kilogram', 'kilograms') THEN 'metric-kilogram'
            WHEN normalized.alias IN ('oz', 'ounce', 'ounces') THEN 'us-ounce'
            WHEN normalized.alias IN ('lb', 'lbs', 'pound', 'pounds') THEN 'us-pound'
            WHEN normalized.alias IN ('ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres') THEN 'metric-milliliter'
            WHEN normalized.alias IN ('cl', 'centiliter', 'centiliters', 'centilitre', 'centilitres') THEN 'metric-centiliter'
            WHEN normalized.alias IN ('dl', 'deciliter', 'deciliters', 'decilitre', 'decilitres') THEN 'metric-deciliter'
            WHEN normalized.alias IN ('l', 'liter', 'liters', 'litre', 'litres') THEN 'metric-liter'
            WHEN normalized.alias IN ('tsk', 'teaske') THEN 'metric-teaspoon'
            WHEN normalized.alias IN ('spsk', 'spiseske') THEN 'metric-tablespoon'
            WHEN normalized.alias IN ('metric cup', 'metric cups') THEN 'metric-cup'
            WHEN normalized.alias IN ('fl oz', 'fluid ounce', 'fluid ounces') THEN 'us-fluid-ounce'
            WHEN normalized.alias IN ('c', 'us cup', 'us cups') THEN 'us-cup'
            WHEN normalized.alias IN ('pt', 'pint', 'pints', 'us pint', 'us pints') THEN 'us-pint'
            WHEN normalized.alias IN ('qt', 'quart', 'quarts', 'us quart', 'us quarts') THEN 'us-quart'
            WHEN normalized.alias IN ('gal', 'gallon', 'gallons', 'us gallon', 'us gallons') THEN 'us-gallon'
            WHEN normalized.alias IN ('piece', 'pieces', 'pc', 'pcs', 'each') THEN 'count-piece'
            WHEN normalized.alias IN ('clove', 'cloves') THEN 'count-clove'
            WHEN normalized.alias IN ('can', 'cans', 'tin', 'tins') THEN 'count-can'
            WHEN normalized.alias IN ('bunch', 'bunches') THEN 'count-bunch'
            WHEN normalized.alias IN ('pinch', 'pinches') THEN 'count-pinch'
            WHEN normalized.alias IN ('handful', 'handfuls') THEN 'count-handful'
            ELSE NULL
        END AS canonical_id
    FROM normalized
)
SELECT
    resolved."id",
    resolved.canonical_id AS "unitId",
    COALESCE(resolved.canonical_id, 'unit:' || resolved.alias) AS "unitKey"
FROM resolved;

WITH duplicate_groups AS (
    SELECT
        min(pantry."id") AS keeper_id,
        pantry."householdId",
        pantry."ingredientName",
        normalization."unitKey",
        sum(pantry."quantity") AS total_quantity
    FROM "PantryItem" pantry
    JOIN "PantryUnitNormalization" normalization ON normalization."id" = pantry."id"
    GROUP BY pantry."householdId", pantry."ingredientName", normalization."unitKey"
)
UPDATE "PantryItem" pantry
SET "quantity" = duplicate_groups.total_quantity
FROM duplicate_groups
WHERE pantry."id" = duplicate_groups.keeper_id;

WITH duplicate_groups AS (
    SELECT
        min(pantry."id") AS keeper_id,
        pantry."householdId",
        pantry."ingredientName",
        normalization."unitKey"
    FROM "PantryItem" pantry
    JOIN "PantryUnitNormalization" normalization ON normalization."id" = pantry."id"
    GROUP BY pantry."householdId", pantry."ingredientName", normalization."unitKey"
)
DELETE FROM "PantryItem" pantry
USING "PantryUnitNormalization" normalization, duplicate_groups
WHERE pantry."id" = normalization."id"
  AND pantry."householdId" = duplicate_groups."householdId"
  AND pantry."ingredientName" = duplicate_groups."ingredientName"
  AND normalization."unitKey" = duplicate_groups."unitKey"
  AND pantry."id" <> duplicate_groups.keeper_id;

UPDATE "PantryItem" pantry
SET
    "unitId" = normalization."unitId",
    "unitKey" = normalization."unitKey"
FROM "PantryUnitNormalization" normalization
WHERE pantry."id" = normalization."id";

DROP TABLE "PantryUnitNormalization";
