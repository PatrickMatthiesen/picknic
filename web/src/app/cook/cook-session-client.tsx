"use client";

import { ArrowLeft, Check, Minus, Plus, Utensils } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { aggregateIngredients, groupIngredientsByComponent } from "@/lib/ingredients";
import { formatMealType } from "@/lib/recipe-display";

type Ingredient = { id: string; name: string; quantity: number | null; unit: string | null; component: string | null };
type CookRecipe = { id: string; title: string; servings: number; ingredients: Ingredient[]; steps: Array<{ id: string; position: number; instruction: string }> };
type Props = { dateKey: string; entryId: string; imageUrl: string; mealType: string; recipe: CookRecipe; servingsOverride: number | null };

export function CookSessionClient({ dateKey, entryId, imageUrl, mealType, recipe, servingsOverride }: Props) {
  const [servings, setServings] = useState(servingsOverride ?? recipe.servings);
  const [ingredientMode, setIngredientMode] = useState<"all" | "component">("all");
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const scrollKey = `picknic:cook-scroll:${entryId}:${recipe.id}`;
  const progressKey = `picknic:cook-progress:${entryId}:${recipe.id}`;
  const multiplier = servings / Math.max(1, recipe.servings);
  const allIngredients = useMemo(() => aggregateIngredients(recipe.ingredients, multiplier), [multiplier, recipe.ingredients]);
  const groups = useMemo(() => groupIngredientsByComponent(recipe.ingredients), [recipe.ingredients]);

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
    const saveScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => sessionStorage.setItem(scrollKey, String(window.scrollY)));
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("pagehide", saveScroll);
    return () => { saveScroll(); cancelAnimationFrame(frame); window.removeEventListener("scroll", saveScroll); window.removeEventListener("pagehide", saveScroll); };
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
          <h2>Ingredients</h2>
          {groups.length > 1 ? <div className="ingredient-mode" role="group" aria-label="Ingredient grouping"><button className={ingredientMode === "all" ? "is-active" : undefined} onClick={() => setIngredientMode("all")}>All</button><button className={ingredientMode === "component" ? "is-active" : undefined} onClick={() => setIngredientMode("component")}>By component</button></div> : null}
          {ingredientMode === "all" ? (
            <ul>{allIngredients.map((ingredient) => { const id = `${ingredient.name}:${ingredient.unit}`; return <li key={id}><button aria-label={`Mark ${ingredient.name} ${checkedIngredients.has(id) ? "needed" : "ready"}`} className={checkedIngredients.has(id) ? "is-checked" : undefined} onClick={() => setCheckedIngredients((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}><Check size={14} /></button><span>{ingredient.name}</span><strong>{ingredient.quantity ?? ""} {ingredient.unit ?? ""}</strong></li>; })}</ul>
          ) : (
            <div className="ingredient-components">{groups.map((group) => <section key={group.component}><h3>{group.component}</h3><ul>{group.ingredients.map((ingredient) => <li key={ingredient.id}><span>{ingredient.name}</span><strong>{ingredient.quantity == null ? "" : Math.round(Number(ingredient.quantity) * multiplier * 100) / 100} {ingredient.unit ?? ""}</strong></li>)}</ul></section>)}</div>
          )}
        </section>
      </aside>

      <article className="cook-recipe">
        <header><div><h1 className="recipe-title">{recipe.title}</h1><p><span><Utensils size={17} /> {formatMealType(mealType)}</span></p></div><Image alt="" height={180} loading="eager" src={imageUrl} width={300} /></header>
        <ol className="cook-steps">{recipe.steps.map((step) => { const complete = completedSteps.has(step.id); return <li className={complete ? "is-complete" : undefined} key={step.id}><button aria-label={`${complete ? "Mark step incomplete" : "Mark step complete"}: ${step.instruction}`} onClick={() => toggleStep(step.id)}>{complete ? <Check size={20} /> : step.position}</button><p>{step.instruction}</p></li>; })}</ol>
      </article>
    </main>
  );
}
