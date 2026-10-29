import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readRecipeSnapshot } from "@/lib/recipe-revisions";
import type { RecipeSearchFilters } from "@/lib/recipe-search";

type SearchOptions = RecipeSearchFilters & {
  userId: string; householdId: string;
  view: "mine" | "all" | "saved" | "collections" | "discover";
  collectionId?: string; page?: string; pageSize?: number;
};

export async function loadRecipeSearchPage(options: SearchOptions) {
  const { userId, householdId, view } = options;
  const saved = Prisma.sql`EXISTS (SELECT 1 FROM "SavedRecipe" s WHERE s."recipeId" = r.id AND s."userId" = ${userId})`;
  const own = Prisma.sql`r."householdId" = ${householdId} AND r."deletedAt" IS NULL`;
  const publicRecipe = Prisma.sql`r.visibility = 'PUBLIC' AND r."deletedAt" IS NULL`;
  const access = view === "discover" ? Prisma.sql`${publicRecipe} AND r."householdId" <> ${householdId}`
    : view === "saved" ? saved
    : view === "collections" ? Prisma.sql`EXISTS (
        SELECT 1 FROM "RecipeCollectionItem" i JOIN "RecipeCollection" c ON c.id = i."collectionId"
        WHERE i."recipeId" = r.id AND c."userId" = ${userId}
        ${options.collectionId ? Prisma.sql`AND c.id = ${options.collectionId}` : Prisma.empty}
      )`
    : view === "all" ? Prisma.sql`(${own}) OR (${publicRecipe}) OR (${saved})`
    : Prisma.sql`(${own}) OR (${saved})`;

  // Search the same content that will be displayed. In particular, private live
  // edits must not affect a retained published recipe's inclusion or count.
  const filters: Prisma.Sql[] = [];
  for (const word of options.q?.trim().split(/\s+/).filter(Boolean) ?? []) {
    filters.push(Prisma.sql`strpos(lower(concat_ws(' ', title, array_to_string(tags, ' '), array_to_string(ingredients, ' '))), lower(${word})) > 0`);
  }
  const minutes = Number(options.maxMinutes);
  if (Number.isFinite(minutes) && minutes > 0) filters.push(Prisma.sql`minutes <= ${minutes}`);
  if (options.diet?.trim()) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM unnest(tags) tag WHERE lower(tag) = lower(${options.diet.trim()}))`);
  for (const excluded of options.exclude?.split(",").map(value => value.trim()).filter(Boolean) ?? []) {
    filters.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM unnest(ingredients) ingredient WHERE strpos(lower(ingredient), lower(${excluded})) > 0)`);
  }
  const filtered = Prisma.sql`WITH candidates AS (
    SELECT r.*, (${own}) AS live, rr.snapshot
    FROM "Recipe" r LEFT JOIN "RecipeRevision" rr ON rr.id = r."latestRevisionId" AND rr."recipeId" = r.id
    WHERE (${access})
  ), displayed AS (
    SELECT id, "updatedAt",
      CASE WHEN live THEN title ELSE snapshot->>'title' END AS title,
      CASE WHEN live THEN "totalTimeMinutes" ELSE (snapshot->>'totalTimeMinutes')::numeric END AS minutes,
      CASE WHEN live THEN tags ELSE ARRAY(SELECT jsonb_array_elements_text(COALESCE(snapshot->'tags', '[]'::jsonb))) END AS tags,
      CASE WHEN live THEN ARRAY(SELECT i.name FROM "RecipeIngredient" i WHERE i."recipeId" = candidates.id)
        ELSE ARRAY(SELECT i->>'name' FROM jsonb_array_elements(COALESCE(snapshot->'ingredients', '[]'::jsonb)) i) END AS ingredients
    FROM candidates WHERE live OR snapshot IS NOT NULL
  ) SELECT id, "updatedAt" FROM displayed WHERE ${filters.length ? Prisma.join(filters, " AND ") : Prisma.sql`TRUE`}`;

  const [count] = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM (${filtered}) matches`);
  const total = Number(count?.total ?? 0);
  const pageSize = Math.min(48, Math.max(1, Math.floor(options.pageSize ?? 24)));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(Number(options.page) || 1)));
  const pageIds = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`${filtered} ORDER BY "updatedAt" DESC, id ASC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
  const recipes = pageIds.length ? await prisma.recipe.findMany({
    where: { id: { in: pageIds.map(row => row.id) } },
    include: { ingredients: true, steps: true, saves: { where: { userId }, select: { userId: true, lastSeenRevisionId: true } }, collectionItems: { where: { collection: { userId } }, select: { collectionId: true } } },
  }) : [];
  const ids = recipes.filter(recipe => recipe.householdId !== householdId || recipe.deletedAt !== null).map(recipe => recipe.latestRevisionId).filter((id): id is string => !!id);
  const revisions = ids.length ? await prisma.recipeRevision.findMany({ where: { id: { in: ids } } }) : [];
  const snapshots = new Map(revisions.map(revision => [revision.id, readRecipeSnapshot(revision.snapshot)]));
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const items = pageIds.map(row => byId.get(row.id)).filter(recipe => recipe !== undefined).map(recipe => {
    if (recipe.householdId === householdId && !recipe.deletedAt) return recipe;
    const snapshot = recipe.latestRevisionId ? snapshots.get(recipe.latestRevisionId) : undefined;
    if (!snapshot) return null;
    return { ...recipe, ...snapshot, id: recipe.id, ingredients: snapshot.ingredients.map(item => ({ ...item, recipeId: recipe.id })), steps: snapshot.steps };
  }).filter(recipe => recipe !== null);
  return { items, total, page, pageCount };
}
