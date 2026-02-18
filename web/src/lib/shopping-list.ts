import { ShoppingItemSource, ShoppingItemStatus } from "@prisma/client";

type IngredientInput = {
  name: string;
  quantity: unknown;
  unit: string | null;
};

type MealPlanEntryInput = {
  servingsOverride: number | null;
  recipe: {
    servings: number;
    ingredients: IngredientInput[];
  };
};

type MealPlanInput = {
  entries: MealPlanEntryInput[];
};

type PantryItemInput = {
  ingredientName: string;
  unit: string;
  quantity: unknown;
};

type ShoppingAggregate = {
  ingredientName: string;
  unit: string | null;
  quantity: number | null;
  source: ShoppingItemSource;
  status: ShoppingItemStatus;
};

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildAutoShoppingItems(mealPlan: MealPlanInput): ShoppingAggregate[] {
  const aggregated = new Map<string, ShoppingAggregate>();

  for (const entry of mealPlan.entries) {
    const servings = entry.recipe.servings > 0 ? entry.recipe.servings : 1;
    const multiplier = entry.servingsOverride && entry.servingsOverride > 0 ? entry.servingsOverride / servings : 1;

    for (const ingredient of entry.recipe.ingredients) {
      const ingredientName = ingredient.name.trim();
      if (!ingredientName) {
        continue;
      }

      const unit = ingredient.unit?.trim() || null;
      const key = `${ingredientName.toLowerCase()}::${unit?.toLowerCase() ?? ""}`;
      const numericQuantity =
        ingredient.quantity !== null && ingredient.quantity !== undefined ? Number(ingredient.quantity) : null;
      const scaledQuantity =
        numericQuantity !== null && Number.isFinite(numericQuantity) ? roundToTwo(numericQuantity * multiplier) : null;

      const existing = aggregated.get(key);
      if (!existing) {
        aggregated.set(key, {
          ingredientName,
          unit,
          quantity: scaledQuantity,
          source: ShoppingItemSource.AUTO,
          status: ShoppingItemStatus.PENDING,
        });
        continue;
      }

      if (existing.quantity === null || scaledQuantity === null) {
        existing.quantity = null;
      } else {
        existing.quantity = roundToTwo(existing.quantity + scaledQuantity);
      }
    }
  }

  return Array.from(aggregated.values()).sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
}

export function subtractPantryFromShoppingItems(
  shoppingItems: ShoppingAggregate[],
  pantryItems: PantryItemInput[],
): ShoppingAggregate[] {
  const pantryTotals = new Map<string, number>();

  for (const pantryItem of pantryItems) {
    const ingredientName = pantryItem.ingredientName.trim();
    const unit = pantryItem.unit.trim();
    const quantity = Number(pantryItem.quantity);

    if (!ingredientName || !unit || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    const key = `${ingredientName.toLowerCase()}::${unit.toLowerCase()}`;
    pantryTotals.set(key, roundToTwo((pantryTotals.get(key) ?? 0) + quantity));
  }

  return shoppingItems
    .map((item) => {
      if (item.quantity === null || !item.unit) {
        return item;
      }

      const key = `${item.ingredientName.toLowerCase()}::${item.unit.toLowerCase()}`;
      const pantryQuantity = pantryTotals.get(key) ?? 0;

      if (pantryQuantity <= 0) {
        return item;
      }

      const remaining = roundToTwo(item.quantity - pantryQuantity);
      if (remaining <= 0) {
        return null;
      }

      return {
        ...item,
        quantity: remaining,
      };
    })
    .filter((item): item is ShoppingAggregate => item !== null);
}
