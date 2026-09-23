import { ShoppingItemSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readRecipeSnapshot } from "@/lib/recipe-revisions";
import { buildAutoShoppingItems, shoppingItemKey, subtractPantryFromShoppingItems } from "@/lib/shopping-list";

export async function getShoppingListForWeek(householdId: string, weekStart: Date) {
  const mealPlan = await prisma.mealPlan.findUnique({
    where: {
      householdId_weekStart: {
        householdId,
        weekStart,
      },
    },
    select: { id: true },
  });

  if (!mealPlan) {
    return null;
  }

  return prisma.shoppingList.findFirst({
    where: { householdId, mealPlanId: mealPlan.id },
    include: {
      items: { orderBy: [{ status: "asc" }, { ingredientName: "asc" }] },
    },
  });
}

export async function generateShoppingListForWeek({
  householdId,
  userId,
  weekStart,
}: {
  householdId: string;
  userId: string;
  weekStart: Date;
}) {
  const mealPlan = await prisma.mealPlan.findUnique({
    where: {
      householdId_weekStart: {
        householdId,
        weekStart,
      },
    },
    include: {
      entries: {
        include: {
          recipeRevision: true,
          recipe: {
            select: {
              householdId: true,
              servings: true,
              ingredients: {
                select: { name: true, quantity: true, unit: true, unitId: true },
              },
            },
          },
        },
      },
    },
  });

  if (!mealPlan) {
    throw new Error("No meal plan found for the selected week.");
  }

  const pantryItems = await prisma.pantryItem.findMany({
    where: { householdId },
    select: { ingredientName: true, unit: true, unitId: true, quantity: true },
  });

  const pinnedMealPlan = {
    entries: mealPlan.entries.map((entry) => {
      const snapshot = entry.recipeRevision ? readRecipeSnapshot(entry.recipeRevision.snapshot) : null;
      if (!snapshot && entry.recipe.householdId !== householdId) {
        throw new Error("A shared planned recipe is missing its pinned revision.");
      }
      return {
        servingsOverride: entry.servingsOverride,
        recipe: snapshot
          ? {
              servings: snapshot.servings,
              ingredients: snapshot.ingredients,
            }
          : entry.recipe,
      };
    }),
  };
  const autoItems = subtractPantryFromShoppingItems(buildAutoShoppingItems(pinnedMealPlan), pantryItems);
  return prisma.$transaction(async (tx) => {
    // Upserting the parent inside the transaction also serializes refreshes for
    // this list, so concurrent requests cannot create duplicate generated items.
    const shoppingList = await tx.shoppingList.upsert({
      where: { mealPlanId: mealPlan.id },
      create: {
        householdId,
        mealPlanId: mealPlan.id,
        createdById: userId,
        name: `Week of ${weekStart.toISOString().slice(0, 10)}`,
      },
      update: { name: `Week of ${weekStart.toISOString().slice(0, 10)}` },
      select: { id: true },
    });
    const existingItems = await tx.shoppingListItem.findMany({
      where: { shoppingListId: shoppingList.id, source: ShoppingItemSource.AUTO },
    });
    const existingByKey = new Map(existingItems.map((item) => [shoppingItemKey(item), item]));
    const retainedIds: string[] = [];

    for (const item of autoItems) {
      const existing = existingByKey.get(shoppingItemKey(item));
      if (existing) {
        retainedIds.push(existing.id);
        // Do not write status: keep checked/skipped state, including status
        // changes made by another household member while the list refreshes.
        await tx.shoppingListItem.update({
          where: { id: existing.id },
          data: {
            ingredientName: item.ingredientName,
            quantity: item.quantity,
            unit: item.unit,
            unitId: item.unitId,
          },
        });
      } else {
        const created = await tx.shoppingListItem.create({
          data: { shoppingListId: shoppingList.id, ...item },
          select: { id: true },
        });
        retainedIds.push(created.id);
      }
    }

    await tx.shoppingListItem.deleteMany({
      where: {
        shoppingListId: shoppingList.id,
        source: ShoppingItemSource.AUTO,
        id: { notIn: retainedIds },
      },
    });

    return tx.shoppingList.findUnique({
      where: { id: shoppingList.id },
      include: { items: { orderBy: [{ status: "asc" }, { ingredientName: "asc" }] } },
    });
  });
}
