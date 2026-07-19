import { getUnitById, resolveUnambiguousUnit } from "./units";

export type IngredientLike = {
  name: string;
  quantity: unknown;
  unit: string | null;
  unitId?: string | null;
  component?: string | null;
  componentId?: string | null;
  componentPosition?: number | null;
};

export type IngredientGroup<T extends IngredientLike = IngredientLike> = {
  component: string;
  ingredients: T[];
  key: string;
};

export type AggregatedIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  unitId: string | null;
};

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export function groupIngredientsByComponent<T extends IngredientLike>(ingredients: T[]): IngredientGroup<T>[] {
  const groups = new Map<string, { component: string; position: number; ingredients: T[] }>();

  for (const ingredient of ingredients) {
    const component = ingredient.component?.trim() || "Main";
    const key = ingredient.componentId?.trim() || `legacy:${component}`;
    const current = groups.get(key) ?? { component, position: ingredient.componentPosition ?? groups.size + 1, ingredients: [] };
    current.ingredients.push(ingredient);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .sort(([, left], [, right]) => left.position - right.position)
    .map(([key, { component, ingredients: groupedIngredients }]) => ({ component, ingredients: groupedIngredients, key }));
}

export function aggregateIngredients(
  ingredients: IngredientLike[],
  multiplier = 1,
): AggregatedIngredient[] {
  const totals = new Map<string, AggregatedIngredient>();

  for (const ingredient of ingredients) {
    const name = ingredient.name.trim();
    if (!name) {
      continue;
    }

    const definition = getUnitById(ingredient.unitId) ?? resolveUnambiguousUnit(ingredient.unit);
    const unit = definition?.symbol ?? ingredient.unit?.trim() ?? null;
    const unitId = definition?.id ?? null;
    const key = `${name.toLocaleLowerCase()}::${unitId ?? unit?.toLocaleLowerCase() ?? ""}`;
    const numericQuantity = ingredient.quantity == null ? null : Number(ingredient.quantity);
    const quantity = numericQuantity !== null && Number.isFinite(numericQuantity)
      ? numericQuantity * multiplier
      : null;
    const existing = totals.get(key);

    if (!existing) {
      totals.set(key, { name, quantity, unit, unitId });
    } else if (existing.quantity === null || quantity === null) {
      existing.quantity = null;
    } else {
      existing.quantity += quantity;
    }
  }

  return Array.from(totals.values()).map((item) => ({
    ...item,
    quantity: item.quantity === null ? null : roundToTwo(item.quantity),
  })).sort(
    (left, right) => left.name.localeCompare(right.name) || (left.unit ?? "").localeCompare(right.unit ?? ""),
  );
}
