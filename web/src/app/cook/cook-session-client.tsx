"use client";

import { ArrowLeft, ArrowRight, BellRing, Check, ChevronDown, Clock3, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { IngredientMeasurement, MeasurementPreferenceSelect, useMeasurementPreference } from "@/app/_components/ingredient-measurement";
import { RecipeImage } from "@/app/_components/recipe-image";
import { aggregateIngredients, groupIngredientsByComponent } from "@/lib/ingredients";
import { getLocalDateKey } from "@/lib/meal-plan";
import { formatMealType } from "@/lib/recipe-display";
import type { RecipeSnapshotIngredient, RecipeSnapshotStep } from "@/lib/recipe-revisions";
import { groupRecipeSteps } from "@/lib/recipe-steps";
import { getUnitById, resolveUnambiguousUnit } from "@/lib/units";
import { cookPlannerHref } from "./cook-links";
import { CookLogClient } from "./cook-log-client";

type Ingredient = Omit<RecipeSnapshotIngredient, "position">;
type IngredientMode = "all" | "component";
type Step = RecipeSnapshotStep;
type CookRecipe = { id: string; title: string; servings: number; ingredients: Ingredient[]; steps: Step[] };
type Props = { dateKey: string; entryId: string; imageUrl: string | null; mealType: string; recipe: CookRecipe; recipeRevisionId: string; servingsOverride: number | null };

function ingredientIdentity(ingredient: Pick<Ingredient, "name" | "unit" | "unitId">): string {
  const definition = getUnitById(ingredient.unitId) ?? resolveUnambiguousUnit(ingredient.unit);
  const unit = definition?.id ?? ingredient.unit?.trim().toLocaleLowerCase() ?? "";
  return `${ingredient.name.trim().toLocaleLowerCase()}::${unit}`;
}

function readSession(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Cooking controls remain usable when session storage is unavailable.
  }
}

function StepDetails({ step }: { step: Step }) {
  if (!step.advanceNotice && !step.durationMinutes) return null;
  return (
    <div className="cooking-step-details">
      {step.advanceNotice && <span><BellRing aria-hidden="true" size={15} /> Advance notice</span>}
      {step.durationMinutes ? <span><Clock3 aria-hidden="true" size={15} /> {step.durationMinutes} min</span> : null}
    </div>
  );
}

export function CookSessionClient({ dateKey, entryId, imageUrl, mealType, recipe, recipeRevisionId, servingsOverride }: Props) {
  const router = useRouter();
  const [servings, setServings] = useState(servingsOverride ?? recipe.servings);
  const [ingredientMode, setIngredientMode] = useState<IngredientMode>("all");
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [loadedSession, setLoadedSession] = useState<string | null>(null);
  const [browserDateKey, setBrowserDateKey] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [measurementPreference, setMeasurementPreference] = useMeasurementPreference();
  const ingredientsPanel = useRef<HTMLDetailsElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const standalone = mealType === "COOK NOW";
  const recipeSessionId = `${entryId}:${recipeRevisionId}`;
  const sessionId = standalone && sessionDate ? `${recipeSessionId}:${sessionDate}` : recipeSessionId;
  const progressKey = `picknic:cook-progress:${sessionId}`;
  const scrollKey = `picknic:cook-scroll:${sessionId}`;
  const stepKey = `picknic:cook-step:${sessionId}`;
  const ingredientsKey = `picknic:cook-ingredients:${recipeSessionId}`;
  const ingredientModeKey = `${ingredientsKey}:mode`;
  const multiplier = servings / Math.max(1, recipe.servings);
  const allIngredients = useMemo(() => {
    const notesByIngredient = new Map<string, string[]>();
    for (const ingredient of recipe.ingredients) {
      const notes = ingredient.notes?.trim();
      if (!notes) continue;
      const key = ingredientIdentity(ingredient);
      const current = notesByIngredient.get(key) ?? [];
      if (!current.includes(notes)) current.push(notes);
      notesByIngredient.set(key, current);
    }

    return aggregateIngredients(recipe.ingredients, multiplier).map((ingredient) => ({
      ...ingredient,
      notes: notesByIngredient.get(ingredientIdentity(ingredient)) ?? [],
    }));
  }, [multiplier, recipe.ingredients]);
  const groups = useMemo(() => groupIngredientsByComponent(recipe.ingredients), [recipe.ingredients]);
  const stepGroups = useMemo(() => groupRecipeSteps(recipe.steps), [recipe.steps]);
  const steps = useMemo(() => [...recipe.steps].sort((left, right) => left.position - right.position), [recipe.steps]);
  const selectedIndex = steps.findIndex((step) => step.id === selectedStepId);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : steps.findIndex((step) => !completedSteps.has(step.id));
  const activeStep = steps[activeIndex];
  const completedCount = steps.filter((step) => completedSteps.has(step.id)).length;
  const plannerHref = cookPlannerHref(standalone ? browserDateKey ?? dateKey : dateKey);

  useLayoutEffect(() => {
    if (!standalone) return;
    let timer: ReturnType<typeof setTimeout>;

    function refreshBrowserDate() {
      const today = getLocalDateKey();
      setBrowserDateKey(today);
      setSessionDate((startedOn) => startedOn ?? today);
      clearTimeout(timer);
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(refreshBrowserDate, Math.max(1, midnight.getTime() - Date.now()));
    }

    const frame = requestAnimationFrame(refreshBrowserDate);
    window.addEventListener("focus", refreshBrowserDate);
    document.addEventListener("visibilitychange", refreshBrowserDate);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener("focus", refreshBrowserDate);
      document.removeEventListener("visibilitychange", refreshBrowserDate);
    };
  }, [standalone]);

  useLayoutEffect(() => {
    if (standalone && !sessionDate) return;
    const frame = requestAnimationFrame(() => {
      let savedSteps: string[] = [];
      try {
        const stored: unknown = JSON.parse(readSession(progressKey) ?? "[]");
        if (Array.isArray(stored)) savedSteps = stored.filter((id): id is string => typeof id === "string");
      } catch {
        // Ignore progress written in an invalid format.
      }
      setCompletedSteps(new Set(savedSteps));
      setSelectedStepId(readSession(stepKey) || null);
      setIngredientMode(readSession(ingredientModeKey) === "component" ? "component" : "all");
      setLoadedSession(sessionId);
    });

    if (ingredientsPanel.current) {
      const saved = readSession(ingredientsKey);
      ingredientsPanel.current.open = saved === null ? window.matchMedia("(min-width: 1080px)").matches : saved === "true";
    }

    return () => cancelAnimationFrame(frame);
  }, [ingredientModeKey, ingredientsKey, progressKey, sessionDate, sessionId, standalone, stepKey]);

  useLayoutEffect(() => {
    if (loadedSession !== sessionId) return;
    const savedScroll = Number(readSession(scrollKey));
    window.scrollTo({ top: Number.isFinite(savedScroll) ? savedScroll : 0, behavior: "instant" });

    let frame = 0;
    function persistScroll() {
      cancelAnimationFrame(frame);
      saveSession(scrollKey, String(window.scrollY));
    }
    function scheduleScrollSave() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(persistScroll);
    }
    window.addEventListener("scroll", scheduleScrollSave, { passive: true });
    window.addEventListener("pagehide", persistScroll);
    return () => {
      window.removeEventListener("scroll", scheduleScrollSave);
      window.removeEventListener("pagehide", persistScroll);
      persistScroll();
    };
  }, [loadedSession, scrollKey, sessionId]);

  function toggleIngredient(id: string) {
    setCheckedIngredients((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function showIngredients(mode: IngredientMode) {
    setIngredientMode(mode);
    saveSession(ingredientModeKey, mode);
  }

  function toggleStep(id: string) {
    const next = new Set(completedSteps);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCompletedSteps(next);
    saveSession(progressKey, JSON.stringify([...next]));
  }

  function completeCurrentStep(step: Step) {
    toggleStep(step.id);
    const next = steps.slice(activeIndex + 1).find((item) => !completedSteps.has(item.id));
    showStep(next?.id ?? null);
  }

  function showStep(id: string | null) {
    setSelectedStepId(id);
    saveSession(stepKey, id ?? "");
    requestAnimationFrame(() => {
      stepHeading.current?.focus({ preventScroll: true });
      stepHeading.current?.scrollIntoView({ block: "start" });
    });
  }

  return (
    <section className="cooking-session">
      <header className="cooking-header">
        <nav aria-label="Cooking navigation" className="cooking-links">
          <Link className="cooking-back" href={standalone ? `/recipes/${recipe.id}` : plannerHref}>
            <ArrowLeft aria-hidden="true" size={17} /> {standalone ? "Back to recipe" : "Back to meal plan"}
          </Link>
          {standalone && (
            <Link className="cooking-back" href={plannerHref} onNavigate={(event) => {
              const todayHref = cookPlannerHref(getLocalDateKey());
              if (todayHref === plannerHref) return;
              event.preventDefault();
              router.push(todayHref);
            }}>Meal plan</Link>
          )}
        </nav>
        <div className="cooking-title">
          <div>
            <p className="cooking-meal">{formatMealType(mealType)}</p>
            <h1 className="recipe-title">{recipe.title}</h1>
          </div>
          <RecipeImage alt="" height={128} loading="eager" recipe={{ id: recipe.id, imageUrl }} width={192} />
        </div>
      </header>

      <section className="cooking-focus" aria-labelledby="cooking-step-title">
        {steps.length > 0 && (
          <div className="cooking-progress">
            <progress aria-label="Cooking progress" max={steps.length} value={completedCount} />
            <span>{completedCount} of {steps.length} done</span>
          </div>
        )}
        {activeStep && (
          <>
            <div className="cooking-current-heading">
              <h2 id="cooking-step-title" ref={stepHeading} tabIndex={-1}>Step {activeIndex + 1} of {steps.length}</h2>
              {activeStep.component ? <span>{activeStep.component}</span> : null}
            </div>
            <p className="cooking-instruction">{activeStep.instruction}</p>
            <StepDetails step={activeStep} />
            <div className="cooking-controls">
              {completedSteps.has(activeStep.id) ? (
                <button className="app-theme-secondary-button cooking-done" onClick={() => toggleStep(activeStep.id)} type="button">Mark incomplete</button>
              ) : (
                <button className="app-theme-primary-button cooking-done" onClick={() => completeCurrentStep(activeStep)} type="button">
                  <Check aria-hidden="true" size={19} /> {steps.length - completedCount > 1 ? "Done and next" : "Finish cooking"}
                </button>
              )}
              <div className="cooking-step-navigation">
                <button aria-label="Previous step" disabled={activeIndex === 0} onClick={() => showStep(steps[activeIndex - 1].id)} type="button"><ArrowLeft aria-hidden="true" size={19} /></button>
                <button aria-label="Next step" disabled={activeIndex >= steps.length - 1} onClick={() => showStep(steps[activeIndex + 1].id)} type="button"><ArrowRight aria-hidden="true" size={19} /></button>
              </div>
            </div>
          </>
        )}
        {(!activeStep || (standalone && completedCount === steps.length)) && (
          <div className="cooking-finished">
            {!activeStep && <h2 id="cooking-step-title" ref={stepHeading} tabIndex={-1}>{steps.length > 0 ? "All steps done" : "No instructions yet"}</h2>}
            {standalone && completedCount === steps.length && <CookLogClient recipeId={recipe.id} recipeRevisionId={recipeRevisionId} />}
            {!activeStep && steps.length > 0 && (
              <button className="app-theme-secondary-button cooking-review" onClick={() => showStep(steps[steps.length - 1].id)} type="button">Review last step</button>
            )}
          </div>
        )}
      </section>

      <details className="cooking-ingredients" onToggle={(event) => saveSession(ingredientsKey, String(event.currentTarget.open))} ref={ingredientsPanel}>
        <summary><span>Ingredients</span><span>Serves {servings} <ChevronDown aria-hidden="true" size={17} /></span></summary>
        <div className="cooking-ingredients-content">
          <div className="cooking-ingredient-tools">
            <div className="cooking-servings" role="group" aria-label="Servings">
              <button aria-label="Decrease servings" disabled={servings <= 1} onClick={() => setServings((value) => Math.max(1, value - 1))} type="button"><Minus aria-hidden="true" size={16} /></button>
              <span>{servings}</span>
              <button aria-label="Increase servings" onClick={() => setServings((value) => value + 1)} type="button"><Plus aria-hidden="true" size={16} /></button>
            </div>
            <MeasurementPreferenceSelect onChange={setMeasurementPreference} value={measurementPreference} />
          </div>
          {groups.length > 1 && (
            <div className="cooking-ingredient-mode" role="group" aria-label="Ingredient grouping">
              <button aria-pressed={ingredientMode === "all"} onClick={() => showIngredients("all")} type="button">All</button>
              <button aria-pressed={ingredientMode === "component"} onClick={() => showIngredients("component")} type="button">By component</button>
            </div>
          )}
          {allIngredients.length === 0 && <p className="app-theme-muted">No ingredients listed.</p>}
          {ingredientMode === "all" ? (
            <ul className="cooking-ingredient-list">
              {allIngredients.map((ingredient) => {
                const id = ingredientIdentity(ingredient);
                const checked = checkedIngredients.has(id);
                return (
                  <li key={id}>
                    <button aria-label={`Mark ${ingredient.name} ${checked ? "needed" : "ready"}`} aria-pressed={checked} onClick={() => toggleIngredient(id)} type="button">
                      {checked && <Check aria-hidden="true" size={16} />}
                    </button>
                    <span>{ingredient.name}{ingredient.notes.length > 0 && <small>{ingredient.notes.join(" · ")}</small>}</span>
                    <IngredientMeasurement preference={measurementPreference} quantity={ingredient.quantity} unit={ingredient.unit} unitId={ingredient.unitId} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="cooking-ingredient-groups">
              {groups.map((group) => (
                <section key={group.key}>
                  <h3>{group.component || "Ingredients"}</h3>
                  <ul className="cooking-ingredient-list">
                    {group.ingredients.map((ingredient) => (
                      <li key={ingredient.id}>
                        <span>{ingredient.name}{ingredient.notes && <small>{ingredient.notes}</small>}</span>
                        <IngredientMeasurement multiplier={multiplier} preference={measurementPreference} quantity={ingredient.quantity} unit={ingredient.unit} unitId={ingredient.unitId} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </details>

      {steps.length > 0 && (
        <section aria-labelledby="cooking-overview-title" className="cooking-overview">
          <h2 id="cooking-overview-title">All steps</h2>
          {stepGroups.map((group) => (
            <section key={group.key}>
              {group.component && <h3>{group.component}</h3>}
              {group.durationMinutes > 0 && (group.component || stepGroups.length > 1) && <p className="cooking-group-duration"><Clock3 aria-hidden="true" size={15} /> {group.durationMinutes} min</p>}
              <ol>
                {group.steps.map((step) => {
                  const complete = completedSteps.has(step.id);
                  return (
                    <li key={step.id}>
                      <button aria-label={`Step ${step.position} done`} aria-pressed={complete} className="cooking-step-check" onClick={() => toggleStep(step.id)} type="button">
                        {complete ? <Check aria-hidden="true" size={18} /> : step.position}
                      </button>
                      <div>
                        <p>{step.instruction}</p>
                        <StepDetails step={step} />
                        <button className="cooking-show-step" onClick={() => showStep(step.id)} type="button">Go to step {step.position}</button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </section>
      )}
    </section>
  );
}
