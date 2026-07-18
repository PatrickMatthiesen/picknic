"use client";

import { RecipeVisibility } from "@prisma/client";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export type RecipeDraft = {
  title: string;
  description: string;
  servings: number;
  tags: string[];
  imageUrl: string;
  visibility: RecipeVisibility;
  ingredients: Array<{ name: string; quantity: number | null; unit: string | null; component: string | null }>;
  steps: string[];
};

const EMPTY_DRAFT: RecipeDraft = {
  title: "",
  description: "",
  servings: 4,
  tags: [],
  imageUrl: "",
  visibility: RecipeVisibility.PRIVATE,
  ingredients: [{ name: "", quantity: null, unit: null, component: null }],
  steps: [""],
};

type RecipeEditorClientProps = {
  initialDraft?: RecipeDraft;
  recipeId?: string;
};

export function RecipeEditorClient({ initialDraft = EMPTY_DRAFT, recipeId }: RecipeEditorClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(initialDraft);
  const [sourceText, setSourceText] = useState("");
  const [showImport, setShowImport] = useState(searchParams.get("method") === "copy-paste");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parseRecipe() {
    if (!sourceText.trim()) return;
    setError(null);
    setIsParsing(true);
    try {
      const response = await fetch("/api/recipes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText }),
      });
      const payload = (await response.json()) as {
        data?: Omit<RecipeDraft, "imageUrl" | "visibility" | "ingredients"> & {
          ingredients: Array<{ name: string; quantity: number | null; unit: string | null }>;
        };
        error?: string;
      };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "We could not parse that recipe.");
      setDraft((current) => ({
        ...current,
        ...payload.data,
        ingredients: payload.data!.ingredients.map((ingredient) => ({ ...ingredient, component: null })),
      }));
      setShowImport(false);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "We could not parse that recipe.");
    } finally {
      setIsParsing(false);
    }
  }

  async function saveRecipe() {
    if (!draft.title.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch(recipeId ? `/api/recipes/${recipeId}` : "/api/recipes", {
        method: recipeId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json()) as { data?: { id: string }; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "We could not save this recipe.");
      router.push(`/recipes/${payload.data.id}`);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "We could not save this recipe.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="recipe-editor">
      <div className="recipe-editor-toolbar">
        <button className="app-theme-secondary-button" onClick={() => setShowImport((current) => !current)} type="button">
          <Sparkles size={17} /> Paste recipe
        </button>
        <button className="app-theme-primary-button" disabled={isSaving || !draft.title.trim()} onClick={saveRecipe} type="button">
          {isSaving ? "Saving recipe…" : recipeId ? "Save changes" : "Save recipe"}
        </button>
      </div>

      {showImport ? (
        <section className="recipe-import-panel">
          <label htmlFor="recipe-source">Paste the recipe as you found it</label>
          <textarea id="recipe-source" onChange={(event) => setSourceText(event.target.value)} placeholder="Paste ingredients and instructions here…" rows={8} value={sourceText} />
          <button className="app-theme-primary-button" disabled={isParsing || !sourceText.trim()} onClick={parseRecipe} type="button">
            {isParsing ? "Reading recipe…" : "Fill recipe details"}
          </button>
        </section>
      ) : null}

      <section className="recipe-editor-section recipe-editor-intro">
        <label>
          <span>Recipe title</span>

          <input autoFocus maxLength={140} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} value={draft.title} />

        </label>
        <label>
          <span>Description</span>
          <textarea maxLength={600} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={3} value={draft.description} />
        </label>
        <div className="recipe-editor-meta">
          <label><span>Servings</span><input min={1} onChange={(event) => setDraft((current) => ({ ...current, servings: Math.max(1, Number(event.target.value) || 1) }))} type="number" value={draft.servings} /></label>
          <label><span>Tags</span><input onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) }))} placeholder="Weeknight, vegetarian" value={draft.tags.join(", ")} /></label>
          <label><span>Photo URL</span><input onChange={(event) => setDraft((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="Optional" type="url" value={draft.imageUrl} /></label>
          <label><span>Visibility</span><select onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as RecipeVisibility }))} value={draft.visibility}><option value={RecipeVisibility.PRIVATE}>Household only</option><option value={RecipeVisibility.PUBLIC}>Public</option></select></label>
        </div>
      </section>

      <section className="recipe-editor-section">
        <div className="recipe-editor-heading"><h2>Ingredients</h2><button onClick={() => setDraft((current) => ({ ...current, ingredients: [...current.ingredients, { name: "", quantity: null, unit: null, component: null }] }))} type="button"><Plus size={16} /> Add ingredient</button></div>
        <div className="ingredient-editor-list">
          {draft.ingredients.map((ingredient, index) => (
            <div className="ingredient-editor-row" key={`ingredient-${index}`}>
              <input aria-label={`Ingredient ${index + 1}`} onChange={(event) => setDraft((current) => ({ ...current, ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} placeholder="Ingredient" value={ingredient.name} />
              <input aria-label={`Quantity for ingredient ${index + 1}`} onChange={(event) => setDraft((current) => ({ ...current, ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value ? Number(event.target.value) : null } : item) }))} placeholder="Qty" step="0.01" type="number" value={ingredient.quantity ?? ""} />
              <input aria-label={`Unit for ingredient ${index + 1}`} onChange={(event) => setDraft((current) => ({ ...current, ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value || null } : item) }))} placeholder="Unit" value={ingredient.unit ?? ""} />
              <input aria-label={`Component for ingredient ${index + 1}`} onChange={(event) => setDraft((current) => ({ ...current, ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, component: event.target.value || null } : item) }))} placeholder="Component (optional)" value={ingredient.component ?? ""} />
              <button aria-label={`Delete ingredient ${index + 1}`} disabled={draft.ingredients.length === 1} onClick={() => setDraft((current) => ({ ...current, ingredients: current.ingredients.filter((_, itemIndex) => itemIndex !== index) }))} type="button"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="recipe-editor-section">
        <div className="recipe-editor-heading"><h2>Instructions</h2><button onClick={() => setDraft((current) => ({ ...current, steps: [...current.steps, ""] }))} type="button"><Plus size={16} /> Add step</button></div>
        <div className="step-editor-list">
          {draft.steps.map((step, index) => (
            <div className="step-editor-row" key={`step-${index}`}><span>{index + 1}</span><textarea aria-label={`Step ${index + 1}`} onChange={(event) => setDraft((current) => ({ ...current, steps: current.steps.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} rows={3} value={step} /><button aria-label={`Delete step ${index + 1}`} disabled={draft.steps.length === 1} onClick={() => setDraft((current) => ({ ...current, steps: current.steps.filter((_, itemIndex) => itemIndex !== index) }))} type="button"><Trash2 size={16} /></button></div>
          ))}
        </div>
      </section>

      {error ? <p className="recipe-editor-error" role="alert">{error} Check the fields above and try again.</p> : null}
    </div>
  );
}
