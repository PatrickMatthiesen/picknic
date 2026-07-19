export type RecipeStepLike = {
  component?: string | null;
  durationMinutes?: number | null;
};

export type RecipeStepGroup<T extends RecipeStepLike = RecipeStepLike> = {
  component: string;
  durationMinutes: number;
  steps: T[];
};

export function groupRecipeSteps<T extends RecipeStepLike>(steps: T[]): RecipeStepGroup<T>[] {
  const groups = new Map<string, T[]>();

  for (const step of steps) {
    const component = step.component?.trim() ?? "";
    const current = groups.get(component) ?? [];
    current.push(step);
    groups.set(component, current);
  }

  return Array.from(groups, ([component, groupedSteps]) => ({
    component,
    durationMinutes: groupedSteps.reduce((total, step) => total + (step.durationMinutes ?? 0), 0),
    steps: groupedSteps,
  }));
}
