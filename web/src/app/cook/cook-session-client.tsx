"use client";

import { ArrowLeft, BellRing, Check, Clock3, Minus, Plus, Utensils } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { IngredientMeasurement, MeasurementPreferenceSelect, useMeasurementPreference } from "@/app/_components/ingredient-measurement";
import { RecipeImage } from "@/app/_components/recipe-image";
import { aggregateIngredients, groupIngredientsByComponent } from "@/lib/ingredients";
import { formatMealType } from "@/lib/recipe-display";
import { groupRecipeSteps } from "@/lib/recipe-steps";
import { getUnitById, resolveUnambiguousUnit } from "@/lib/units";

type Ingredient = { id: string; name: string; notes: string | null; quantity: number | null; unit: string | null; unitId: string | null; component: string | null };
type CookRecipe = { id: string; title: string; servings: number; ingredients: Ingredient[]; steps: Array<{ id: string; position: number; instruction: string; component: string | null; durationMinutes: number | null; advanceNotice: boolean }> };
type Props = { dateKey: string; entryId: string; imageUrl: string | null; mealType: string; recipe: CookRecipe; recipeRevisionId: string; servingsOverride: number | null };

function ingredientIdentity(ingredient: Pick<Ingredient, "name" | "unit" | "unitId">): string {
  const definition = getUnitById(ingredient.unitId) ?? resolveUnambiguousUnit(ingredient.unit);
  const unit = definition?.id ?? ingredient.unit?.trim().toLocaleLowerCase() ?? "";
  return `${ingredient.name.trim().toLocaleLowerCase()}::${unit}`;
}

export function CookSessionClient({ dateKey, entryId, imageUrl, mealType, recipe, recipeRevisionId, servingsOverride }: Props) {
  const [servings, setServings] = useState(servingsOverride ?? recipe.servings);
  const [ingredientMode, setIngredientMode] = useState<"all" | "component">("all");
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [measurementPreference, setMeasurementPreference] = useMeasurementPreference();
  const scrollKey = `picknic:cook-scroll:${entryId}:${recipeRevisionId}`;
  const progressKey = `picknic:cook-progress:${entryId}:${recipeRevisionId}`;
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

  useLayoutEffect(() => {
    const savedScroll = Number(sessionStorage.getItem(scrollKey) ?? "0");
    const savedProgress = sessionStorage.getItem(progressKey);
    requestAnimationFrame(() => {
      if (savedProgress) setCompletedSteps(new Set(JSON.parse(savedProgress) as string[]));
      window.scrollTo({ top: savedScroll, behavior: "auto" });
    });
  }, [progressKey, scrollKey]);

  useEffect(() => {
    let frame = 0;
    const persistScroll = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    const scheduleScrollSave = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(persistScroll);
    };
    window.addEventListener("scroll", scheduleScrollSave, { passive: true });
    window.addEventListener("pagehide", persistScroll);
    return () => {
      window.removeEventListener("scroll", scheduleScrollSave);
      window.removeEventListener("pagehide", persistScroll);
      persistScroll();
    };
  }, [scrollKey]);

  function toggleStep(id: string) {
    setCompletedSteps((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      sessionStorage.setItem(progressKey, JSON.stringify(Array.from(next)));
      return next;
    });
  }

  return (
    <main className="cook-session">
      <aside className="cook-sidebar">
        <Link className="cook-back" href={`/planner?day=${dateKey}`}><ArrowLeft size={18} /> Back to this week</Link>
        <div className="cook-servings"><span>Serves {servings}</span><div><button aria-label="Decrease servings" disabled={servings <= 1} onClick={() => setServings((value) => Math.max(1, value - 1))}><Minus size={17} /></button><strong>{servings}</strong><button aria-label="Increase servings" onClick={() => setServings((value) => value + 1)}><Plus size={17} /></button></div></div>
        <section className="cook-ingredients">
          <div className="cook-ingredient-heading"><h2>Ingredients</h2><MeasurementPreferenceSelect onChange={setMeasurementPreference} value={measurementPreference} /></div>
          {groups.length > 1 ? <div className="ingredient-mode" role="group" aria-label="Ingredient grouping"><button className={ingredientMode === "all" ? "is-active" : undefined} onClick={() => setIngredientMode("all")}>All</button><button className={ingredientMode === "component" ? "is-active" : undefined} onClick={() => setIngredientMode("component")}>By component</button></div> : null}
          {ingredientMode === "all" ? (
            <ul>{allIngredients.map((ingredient) => { const id = `${ingredient.name}:${ingredient.unitId ?? ingredient.unit}`; return <li key={id}><button aria-label={`Mark ${ingredient.name} ${checkedIngredients.has(id) ? "needed" : "ready"}`} className={checkedIngredients.has(id) ? "is-checked" : undefined} onClick={() => setCheckedIngredients((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}><Check size={14} /></button><span>{ingredient.name}{ingredient.notes.length ? <small>{ingredient.notes.join(" · ")}</small> : null}</span><strong><IngredientMeasurement preference={measurementPreference} quantity={ingredient.quantity} unit={ingredient.unit} unitId={ingredient.unitId} /></strong></li>; })}</ul>
          ) : (
            <div className="ingredient-components">{groups.map((group) => <section key={group.key}><h3>{group.component}</h3><ul>{group.ingredients.map((ingredient) => <li key={ingredient.id}><span>{ingredient.name}{ingredient.notes ? <small>{ingredient.notes}</small> : null}</span><strong><IngredientMeasurement multiplier={multiplier} preference={measurementPreference} quantity={ingredient.quantity} unit={ingredient.unit} unitId={ingredient.unitId} /></strong></li>)}</ul></section>)}</div>
          )}
        </section>
      </aside>

      <article className="cook-recipe">
        <header><div><h1 className="recipe-title">{recipe.title}</h1><p><span><Utensils size={17} /> {formatMealType(mealType)}</span></p></div><RecipeImage alt="" height={180} loading="eager" recipe={{ id: recipe.id, imageUrl }} width={300} /></header>
        <div className="cook-step-components">{stepGroups.map((group) => <section key={group.key}>{stepGroups.length > 1 || group.component ? <header><h2>{group.component || "Instructions"}</h2>{group.durationMinutes ? <span><Clock3 size={15} /> {group.durationMinutes} min</span> : null}</header> : null}<ol className="cook-steps">{group.steps.map((step) => { const complete = completedSteps.has(step.id); return <li className={complete ? "is-complete" : undefined} key={step.id}><button aria-label={`${complete ? "Mark step incomplete" : "Mark step complete"}: ${step.instruction}`} onClick={() => toggleStep(step.id)}>{complete ? <Check size={20} /> : step.position}</button><div><p>{step.instruction}</p>{step.advanceNotice || step.durationMinutes ? <small>{step.advanceNotice ? <span className="advance-notice"><BellRing size={14} /> Advance notice</span> : null}{step.durationMinutes ? <span><Clock3 size={14} /> {step.durationMinutes} min</span> : null}</small> : null}</div></li>; })}</ol></section>)}</div>
      </article>
    </main>
  );
}
