"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type RecipeMethod = "manual" | "copy-paste" | "url" | "image";

type RecipeDraft = {
  title: string;
  description: string;
  servings: number;
  tags: string[];
  ingredients: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
  }>;
  steps: string[];
};

const EMPTY_DRAFT: RecipeDraft = {
  title: "",
  description: "",
  servings: 1,
  tags: [],
  ingredients: [{ name: "", quantity: null, unit: null }],
  steps: [""],
};

function normalizeMethod(method: string | null): RecipeMethod {
  if (method === "copy-paste" || method === "url" || method === "image") {
    return method;
  }

  return "manual";
}

export function RecipeEditorClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [method, setMethod] = useState<RecipeMethod>(normalizeMethod(searchParams.get("method")));
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [draft, setDraft] = useState<RecipeDraft>(EMPTY_DRAFT);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const tagsText = draft.tags.join(", ");

  async function parseRecipe() {
    if (method !== "copy-paste" || sourceText.trim().length === 0) {
      return;
    }

    setSaved(false);
    setError(null);
    setIsParsing(true);

    try {
      const response = await fetch("/api/recipes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText }),
      });

      const payload = (await response.json()) as { data?: RecipeDraft; error?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to parse recipe.");
      }

      setDraft(payload.data);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Unable to parse recipe.");
    } finally {
      setIsParsing(false);
    }
  }

  async function saveRecipe() {
    setSaved(false);
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });

      const payload = (await response.json()) as { data?: { id: string }; error?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to save recipe.");
      }

      setSaved(true);
      router.push(`/recipes/${payload.data.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save recipe.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="app-theme-card rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Choose how to start</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMethod("manual")}
            className={`rounded-full px-4 py-2 font-medium ${method === "manual" ? "app-theme-primary-button" : "app-theme-link"}`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setMethod("copy-paste")}
            className={`rounded-full px-4 py-2 font-medium ${method === "copy-paste" ? "app-theme-primary-button" : "app-theme-link"}`}
          >
            🍝 Copy paste
          </button>
          <button
            type="button"
            onClick={() => setMethod("url")}
            className={`rounded-full px-4 py-2 font-medium ${method === "url" ? "app-theme-primary-button" : "app-theme-link"}`}
          >
            URL
          </button>
          <button
            type="button"
            onClick={() => setMethod("image")}
            className={`rounded-full px-4 py-2 font-medium ${method === "image" ? "app-theme-primary-button" : "app-theme-link"}`}
          >
            Image
          </button>
        </div>

        {method === "copy-paste" ? (
          <div className="mt-4">
            <textarea
              className="app-theme-input min-h-44 w-full rounded-xl px-3 py-2 text-sm"
              onChange={(event) => setSourceText(event.target.value)}
              placeholder="Paste free-form recipe text here..."
              value={sourceText}
            />
            <button
              className="app-theme-primary-button mt-3 rounded-2xl px-5 py-2 text-sm font-medium disabled:opacity-50"
              disabled={isParsing || sourceText.trim().length === 0}
              onClick={parseRecipe}
              type="button"
            >
              {isParsing ? "Parsing..." : "Parse recipe"}
            </button>
          </div>
        ) : null}

        {method === "url" ? (
          <div className="mt-4 space-y-2">
            <input
              className="app-theme-input w-full rounded-xl px-3 py-2 text-sm"
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://example.com/recipe"
              value={sourceUrl}
            />
            <p className="app-theme-muted text-sm">URL import is coming soon (backend not implemented yet).</p>
          </div>
        ) : null}

        {method === "image" ? (
          <div className="mt-4 space-y-2">
            <input className="app-theme-input w-full rounded-xl px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white/80 file:px-2 file:py-1" type="file" accept="image/*" />
            <p className="app-theme-muted text-sm">Image import is coming soon (backend not implemented yet).</p>
          </div>
        ) : null}
      </section>

      <section className="app-theme-card rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Recipe details</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span>Title</span>
            <input
              className="app-theme-input rounded-xl px-3 py-2"
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              value={draft.title}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span>Description</span>
            <textarea
              className="app-theme-input rounded-xl px-3 py-2"
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              value={draft.description}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>Servings</span>
            <input
              className="app-theme-input rounded-xl px-3 py-2"
              min={1}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  servings: Math.max(1, Number(event.target.value) || 1),
                }))
              }
              type="number"
              value={draft.servings}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>Tags (comma-separated)</span>
            <input
              className="app-theme-input rounded-xl px-3 py-2"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  tags: event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter((tag) => tag.length > 0),
                }))
              }
              value={tagsText}
            />
          </label>
        </div>
      </section>

      <section className="app-theme-card rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ingredients</h2>
          <button
            type="button"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                ingredients: [...current.ingredients, { name: "", quantity: null, unit: null }],
              }))
            }
            className="app-theme-secondary-button rounded-full px-4 py-2 text-sm font-medium"
          >
            Add ingredient
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {draft.ingredients.map((ingredient, index) => (
            <div className="grid gap-2 sm:grid-cols-12" key={`ingredient-${index}`}>
              <input
                className="app-theme-input rounded-xl px-3 py-2 text-sm sm:col-span-5"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    ingredients: current.ingredients.map((currentIngredient, ingredientIndex) =>
                      ingredientIndex === index ? { ...currentIngredient, name: event.target.value } : currentIngredient,
                    ),
                  }))
                }
                placeholder="Ingredient"
                value={ingredient.name}
              />
              <input
                className="app-theme-input rounded-xl px-3 py-2 text-sm sm:col-span-2"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    ingredients: current.ingredients.map((currentIngredient, ingredientIndex) =>
                      ingredientIndex === index
                        ? { ...currentIngredient, quantity: event.target.value ? Number(event.target.value) : null }
                        : currentIngredient,
                    ),
                  }))
                }
                placeholder="Qty"
                step="0.01"
                type="number"
                value={ingredient.quantity ?? ""}
              />
              <input
                className="app-theme-input rounded-xl px-3 py-2 text-sm sm:col-span-3"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    ingredients: current.ingredients.map((currentIngredient, ingredientIndex) =>
                      ingredientIndex === index
                        ? { ...currentIngredient, unit: event.target.value.trim() ? event.target.value : null }
                        : currentIngredient,
                    ),
                  }))
                }
                placeholder="Unit"
                value={ingredient.unit ?? ""}
              />
              <button
                type="button"
                className="app-theme-secondary-button rounded-xl px-3 py-2 text-xs font-semibold sm:col-span-2"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    ingredients:
                      current.ingredients.length > 1
                        ? current.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index)
                        : current.ingredients,
                  }))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="app-theme-card rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Steps</h2>
          <button
            type="button"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                steps: [...current.steps, ""],
              }))
            }
            className="app-theme-secondary-button rounded-full px-4 py-2 text-sm font-medium"
          >
            Add step
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {draft.steps.map((step, index) => (
            <div key={`step-${index}`} className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] app-theme-muted">Step {index + 1}</label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <textarea
                  className="app-theme-input w-full rounded-xl px-3 py-2 text-sm"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      steps: current.steps.map((currentStep, stepIndex) => (stepIndex === index ? event.target.value : currentStep)),
                    }))
                  }
                  rows={2}
                  value={step}
                />
                <button
                  type="button"
                  className="app-theme-secondary-button rounded-xl px-3 py-2 text-xs font-semibold"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      steps: current.steps.length > 1 ? current.steps.filter((_, stepIndex) => stepIndex !== index) : current.steps,
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="app-theme-card rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Save recipe</h2>
        <button
          className="app-theme-primary-button mt-3 rounded-2xl px-5 py-2 text-sm font-medium disabled:opacity-50"
          disabled={isSaving || draft.title.trim().length === 0}
          onClick={saveRecipe}
          type="button"
        >
          {isSaving ? "Saving..." : "Save recipe"}
        </button>
        {saved ? <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">Recipe saved.</p> : null}
        {error ? <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
      </section>
    </div>
  );
}
