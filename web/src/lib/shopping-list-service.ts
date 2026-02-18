import { ShoppingItemSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAutoShoppingItems, subtractPantryFromShoppingItems } from "@/lib/shopping-list";

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
          recipe: {
            select: {
              servings: true,
              ingredients: {
                select: { name: true, quantity: true, unit: true },
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
    select: { ingredientName: true, unit: true, quantity: true },
  });

  const autoItems = subtractPantryFromShoppingItems(buildAutoShoppingItems(mealPlan), pantryItems);
  const shoppingList = await prisma.shoppingList.upsert({
    where: { mealPlanId: mealPlan.id },
    create: {
      householdId,
      mealPlanId: mealPlan.id,
      createdById: userId,
      name: `Week of ${weekStart.toISOString().slice(0, 10)}`,
    },
    update: {
      name: `Week of ${weekStart.toISOString().slice(0, 10)}`,
    },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.shoppingListItem.deleteMany({
      where: {
        shoppingListId: shoppingList.id,
        source: ShoppingItemSource.AUTO,
      },
    });

    if (autoItems.length > 0) {
      await tx.shoppingListItem.createMany({
        data: autoItems.map((item) => ({
          shoppingListId: shoppingList.id,
          ingredientName: item.ingredientName,
          quantity: item.quantity,
          unit: item.unit,
          source: item.source,
          status: item.status,
        })),
      });
    }
  });

  return prisma.shoppingList.findUnique({
    where: { id: shoppingList.id },
    include: {
      items: { orderBy: [{ status: "asc" }, { ingredientName: "asc" }] },
    },
  });
}
