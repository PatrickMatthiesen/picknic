"use client";

import { useState } from "react";

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
  ingredients: [],
  steps: [],
};

export function ImportRecipeClient() {
  const [sourceText, setSourceText] = useState("");
  const [draft, setDraft] = useState<RecipeDraft>(EMPTY_DRAFT);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const tagsText = draft.tags.join(", ");

  async function parseRecipe() {
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

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save recipe.");
      }

      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save recipe.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-zinc-200 p-5">
        <h2 className="text-lg font-semibold">1) Paste recipe text</h2>
        <textarea
          className="mt-3 min-h-44 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          onChange={(event) => setSourceText(event.target.value)}
          placeholder="Paste free-form recipe text here..."
          value={sourceText}
        />
        <button
          className="mt-3 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={isParsing || sourceText.trim().length === 0}
          onClick={parseRecipe}
          type="button"
        >
          {isParsing ? "Parsing..." : "Parse with GitHub Models"}
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 p-5">
        <h2 className="text-lg font-semibold">2) Review and edit</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span>Title</span>
            <input
              className="rounded-md border border-zinc-300 px-3 py-2"
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              value={draft.title}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span>Description</span>
            <textarea
              className="rounded-md border border-zinc-300 px-3 py-2"
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              value={draft.description}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>Servings</span>
            <input
              className="rounded-md border border-zinc-300 px-3 py-2"
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
              className="rounded-md border border-zinc-300 px-3 py-2"
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

        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium">Ingredients</p>
          {draft.ingredients.map((ingredient, index) => (
            <div className="grid gap-2 sm:grid-cols-4" key={`${ingredient.name}-${index}`}>
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
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
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
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
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
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
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium">Steps</p>
          {draft.steps.map((step, index) => (
            <textarea
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              key={`step-${index}`}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  steps: current.steps.map((currentStep, stepIndex) => (stepIndex === index ? event.target.value : currentStep)),
                }))
              }
              rows={2}
              value={step}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 p-5">
        <h2 className="text-lg font-semibold">3) Save recipe</h2>
        <button
          className="mt-3 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={isSaving || draft.title.trim().length === 0}
          onClick={saveRecipe}
          type="button"
        >
          {isSaving ? "Saving..." : "Save recipe"}
        </button>
        {saved ? <p className="mt-2 text-sm text-emerald-700">Recipe saved. Refresh recipes page to view it.</p> : null}
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </section>
    </div>
  );
}
