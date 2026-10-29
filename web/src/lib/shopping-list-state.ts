import { createHash } from "node:crypto";

type PlannedEntry = {
  id: string;
  recipeId: string | null;
  recipeRevisionId: string | null;
  date: Date;
  mealType: string;
  servingsOverride: number | null;
  kind?: string;
  note?: string | null;
};

// Track the exact plan used to generate a list. Child entry edits/deletions do
// not update MealPlan.updatedAt, and shopping item toggles must not reset this.
export function getShoppingPlanFingerprint(entries: PlannedEntry[]): string {
  const plan = entries.map((entry) => [
    entry.id, entry.recipeId, entry.recipeRevisionId,
    entry.date.toISOString(), entry.mealType, entry.servingsOverride, entry.kind ?? "RECIPE", entry.note ?? null,
  ]).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}
