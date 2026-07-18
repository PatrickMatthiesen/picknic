export type IngredientLike = {
  name: string;
  quantity: unknown;
  unit: string | null;
  component?: string | null;
};

export type IngredientGroup<T extends IngredientLike = IngredientLike> = {
  component: string;
  ingredients: T[];
};

export type AggregatedIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export function groupIngredientsByComponent<T extends IngredientLike>(ingredients: T[]): IngredientGroup<T>[] {
  const groups = new Map<string, T[]>();

  for (const ingredient of ingredients) {
    const component = ingredient.component?.trim() || "Main";
    const current = groups.get(component) ?? [];
    current.push(ingredient);
    groups.set(component, current);
  }

  return Array.from(groups, ([component, groupedIngredients]) => ({
    component,
    ingredients: groupedIngredients,
  }));
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

    const unit = ingredient.unit?.trim() || null;
    const key = `${name.toLocaleLowerCase()}::${unit?.toLocaleLowerCase() ?? ""}`;
    const numericQuantity = ingredient.quantity == null ? null : Number(ingredient.quantity);
    const quantity = numericQuantity !== null && Number.isFinite(numericQuantity)
      ? roundToTwo(numericQuantity * multiplier)
      : null;
    const existing = totals.get(key);

    if (!existing) {
      totals.set(key, { name, quantity, unit });
    } else if (existing.quantity === null || quantity === null) {
      existing.quantity = null;
    } else {
      existing.quantity = roundToTwo(existing.quantity + quantity);
    }
  }

  return Array.from(totals.values()).sort(
    (left, right) => left.name.localeCompare(right.name) || (left.unit ?? "").localeCompare(right.unit ?? ""),
  );
}
