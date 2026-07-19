export type RecipeStepLike = {
  component?: string | null;
  componentId?: string | null;
  componentPosition?: number | null;
  durationMinutes?: number | null;
};

export type RecipeStepGroup<T extends RecipeStepLike = RecipeStepLike> = {
  component: string;
  durationMinutes: number;
  key: string;
  steps: T[];
};

export function groupRecipeSteps<T extends RecipeStepLike>(steps: T[]): RecipeStepGroup<T>[] {
  const groups = new Map<string, { component: string; position: number; steps: T[] }>();

  for (const step of steps) {
    const component = step.component?.trim() ?? "";
    const key = step.componentId?.trim() || `legacy:${component}`;
    const current = groups.get(key) ?? { component, position: step.componentPosition ?? groups.size + 1, steps: [] };
    current.steps.push(step);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .sort(([, left], [, right]) => left.position - right.position)
    .map(([key, { component, steps: groupedSteps }]) => ({
      component,
      durationMinutes: groupedSteps.reduce((total, step) => total + (step.durationMinutes ?? 0), 0),
      key,
      steps: groupedSteps,
    }));
}
