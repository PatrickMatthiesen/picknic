import { getUnitById, resolveUnambiguousUnit } from "./units";

export const MAX_RECIPE_MINUTES = 10_080;

export class RecipeInputError extends Error {}

type IngredientPayload = {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unitId?: unknown;
  notes?: unknown;
  component?: unknown;
  componentId?: unknown;
  componentPosition?: unknown;
};

type StepPayload = {
  instruction?: unknown;
  component?: unknown;
  componentId?: unknown;
  componentPosition?: unknown;
  durationMinutes?: unknown;
  advanceNotice?: unknown;
};

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeOptionalMinutes(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const minutes = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_RECIPE_MINUTES) {
    throw new RecipeInputError(`Minutes must be between 1 and ${MAX_RECIPE_MINUTES}.`);
  }
  return Math.floor(minutes);
}

function optionalPosition(value: unknown): number | null {
  const position = typeof value === "number" ? Math.floor(value) : Number.NaN;
  return Number.isFinite(position) && position > 0 ? position : null;
}

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  return [...new Set(
    input
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  )].slice(0, 10);
}

export function normalizeIngredients(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .filter((value): value is IngredientPayload => typeof value === "object" && value !== null)
    .map((ingredient, index) => {
      const quantity =
        typeof ingredient.quantity === "number" || typeof ingredient.quantity === "string"
          ? Number(ingredient.quantity)
          : null;
      const providedUnit = getUnitById(optionalText(ingredient.unitId));
      const authoredUnit = optionalText(ingredient.unit);
      const inferredUnit = providedUnit ?? resolveUnambiguousUnit(authoredUnit);
      const normalizedUnit = {
        unit: providedUnit ? authoredUnit ?? providedUnit.symbol : inferredUnit?.symbol ?? authoredUnit,
        unitId: inferredUnit?.id ?? null,
      };

      return {
        name: typeof ingredient.name === "string" ? ingredient.name.trim() : "",
        quantity: Number.isFinite(quantity) ? quantity : null,
        ...normalizedUnit,
        notes: optionalText(ingredient.notes),
        component: optionalText(ingredient.component),
        componentId: optionalText(ingredient.componentId),
        componentPosition: optionalPosition(ingredient.componentPosition),
        position: index + 1,
      };
    })
    .filter((ingredient) => ingredient.name.length > 0);
}

export function normalizeSteps(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((value, index) => {
      const step: StepPayload = typeof value === "string" ? { instruction: value } : value as StepPayload;
      return {
        instruction: typeof step?.instruction === "string" ? step.instruction.trim() : "",
        component: optionalText(step?.component),
        componentId: optionalText(step?.componentId),
        componentPosition: optionalPosition(step?.componentPosition),
        durationMinutes: normalizeOptionalMinutes(step?.durationMinutes),
        advanceNotice: step?.advanceNotice === true,
        position: index + 1,
      };
    })
    .filter((step) => step.instruction.length > 0);
}
