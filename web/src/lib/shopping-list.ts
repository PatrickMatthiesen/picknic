import { ShoppingItemSource, ShoppingItemStatus } from "@prisma/client";
import { getUnitById, resolveUnambiguousUnit } from "./units";

type IngredientInput = {
  name: string;
  quantity: unknown;
  unit: string | null;
  unitId?: string | null;
};

type MealPlanEntryInput = {
  servingsOverride: number | null;
  recipe?: {
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
  unitId?: string | null;
  quantity: unknown;
};

type ShoppingAggregate = {
  ingredientName: string;
  unit: string | null;
  unitId: string | null;
  quantity: number | null;
  source: ShoppingItemSource;
  status: ShoppingItemStatus;
};

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export function shoppingItemKey(item: { ingredientName: string; unit: string | null; unitId?: string | null }): string {
  const definition = getUnitById(item.unitId) ?? resolveUnambiguousUnit(item.unit);
  return `${item.ingredientName.trim().toLowerCase()}::${definition?.id ?? item.unit?.trim().toLowerCase() ?? ""}`;
}

export function shoppingAggregateKey(item: { ingredientName: string; unit: string | null; unitId?: string | null }): string {
  const definition = getUnitById(item.unitId) ?? resolveUnambiguousUnit(item.unit);
  return definition?.factorToBase != null
    ? `${item.ingredientName.trim().toLowerCase()}::dimension:${definition.dimension}`
    : `unit:${shoppingItemKey(item)}`;
}

export function buildAutoShoppingItems(mealPlan: MealPlanInput): ShoppingAggregate[] {
  const aggregated = new Map<string, ShoppingAggregate>();

  for (const entry of mealPlan.entries) {
    if (!entry.recipe) continue;
    const servings = entry.recipe.servings > 0 ? entry.recipe.servings : 1;
    const multiplier = entry.servingsOverride && entry.servingsOverride > 0 ? entry.servingsOverride / servings : 1;

    for (const ingredient of entry.recipe.ingredients) {
      const ingredientName = ingredient.name.trim();
      if (!ingredientName) {
        continue;
      }

      const definition = getUnitById(ingredient.unitId) ?? resolveUnambiguousUnit(ingredient.unit);
      const unit = definition?.symbol ?? ingredient.unit?.trim() ?? null;
      const numericQuantity =
        ingredient.quantity !== null && ingredient.quantity !== undefined ? Number(ingredient.quantity) : null;
      const scaledQuantity =
        numericQuantity !== null && Number.isFinite(numericQuantity) ? numericQuantity * multiplier : null;
      const key = shoppingAggregateKey({ ingredientName, unit, unitId: definition?.id });

      const existing = aggregated.get(key);
      if (!existing) {
        aggregated.set(key, {
          ingredientName,
          unit,
          unitId: definition?.id ?? null,
          quantity: scaledQuantity,
          source: ShoppingItemSource.AUTO,
          status: ShoppingItemStatus.PENDING,
        });
        continue;
      }

      if (existing.quantity === null || scaledQuantity === null) {
        existing.quantity = null;
      } else {
        const target = getUnitById(existing.unitId);
        if (target && definition && target.dimension === definition.dimension && target.factorToBase && definition.factorToBase) {
          existing.quantity += (scaledQuantity * definition.factorToBase) / target.factorToBase;
        } else {
          existing.quantity += scaledQuantity;
        }
      }
    }
  }

  return Array.from(aggregated.values())
    .map((item) => ({ ...item, quantity: item.quantity === null ? null : roundToTwo(item.quantity) }))
    .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
}

export function subtractPantryFromShoppingItems(
  shoppingItems: ShoppingAggregate[],
  pantryItems: PantryItemInput[],
): ShoppingAggregate[] {
  const pantryTotals = new Map<string, number>();

  for (const pantryItem of pantryItems) {
    const ingredientName = pantryItem.ingredientName.trim();
    const definition = getUnitById(pantryItem.unitId) ?? resolveUnambiguousUnit(pantryItem.unit);
    const unit = definition?.symbol ?? pantryItem.unit.trim();
    const quantity = Number(pantryItem.quantity);

    if (!ingredientName || !unit || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    const key = definition?.factorToBase != null
      ? `${ingredientName.toLowerCase()}::${definition.dimension}`
      : `${ingredientName.toLowerCase()}::unit:${definition?.id ?? unit.toLowerCase()}`;
    const normalizedQuantity = definition?.factorToBase != null ? quantity * definition.factorToBase : quantity;
    pantryTotals.set(key, roundToTwo((pantryTotals.get(key) ?? 0) + normalizedQuantity));
  }

  return shoppingItems
    .map((item) => {
      if (item.quantity === null || !item.unit) {
        return item;
      }

      const definition = getUnitById(item.unitId) ?? resolveUnambiguousUnit(item.unit);
      const key = definition?.factorToBase != null
        ? `${item.ingredientName.toLowerCase()}::${definition.dimension}`
        : `${item.ingredientName.toLowerCase()}::unit:${definition?.id ?? item.unit.toLowerCase()}`;
      const pantryBaseQuantity = pantryTotals.get(key) ?? 0;
      const pantryQuantity = definition?.factorToBase != null ? pantryBaseQuantity / definition.factorToBase : pantryBaseQuantity;

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
