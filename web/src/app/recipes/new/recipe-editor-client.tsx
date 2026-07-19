"use client";

import { RecipeVisibility } from "@prisma/client";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  ArrowLeft,
  BellRing,
  Check,
  Clock3,
  Globe2,
  GripVertical,
  ImageIcon,
  Minus,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { UnitCombobox } from "@/app/_components/unit-combobox";
import { getSupportedRecipeImageUrl } from "@/lib/recipe-display";
import { MAX_RECIPE_MINUTES } from "@/lib/recipe-input";
import {
  inferMeasurementSystem,
  inferSourceMeasurementSystem,
  normalizeUnitInput,
  type MeasurementSystem,
} from "@/lib/units";

type IngredientDraft = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unitId: string | null;
  notes: string;
  isBuffer?: boolean;
};

type StepDraft = {
  id: string;
  instruction: string;
  durationMinutes: number | null;
  advanceNotice: boolean;
  isBuffer?: boolean;
};

type IngredientComponentDraft = { id: string; name: string; ingredients: IngredientDraft[] };
type InstructionComponentDraft = { id: string; name: string; steps: StepDraft[] };

export type RecipeDraft = {
  title: string;
  description: string;
  servings: number;
  totalTimeMinutes: number | null;
  tags: string[];
  imageUrl: string;
  visibility: RecipeVisibility;
  ingredientComponents: IngredientComponentDraft[];
  instructionComponents: InstructionComponentDraft[];
};

type StoredDraft = { version: 1; updatedAt: string; draft: RecipeDraft };
type UndoState = { message: string; restore: () => void };

const EMPTY_DRAFT: RecipeDraft = {
  title: "",
  description: "",
  servings: 4,
  totalTimeMinutes: null,
  tags: [],
  imageUrl: "",
  visibility: RecipeVisibility.PRIVATE,
  ingredientComponents: [{
    id: "ingredient-component-initial",
    name: "",
    ingredients: [{ id: "ingredient-buffer-initial", name: "", quantity: null, unit: null, unitId: null, notes: "", isBuffer: true }],
  }],
  instructionComponents: [{
    id: "instruction-component-initial",
    name: "",
    steps: [{ id: "step-buffer-initial", instruction: "", durationMinutes: null, advanceNotice: false, isBuffer: true }],
  }],
};

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function ingredientBuffer(): IngredientDraft {
  return { id: createId("ingredient"), name: "", quantity: null, unit: null, unitId: null, notes: "", isBuffer: true };
}

function stepBuffer(): StepDraft {
  return { id: createId("step"), instruction: "", durationMinutes: null, advanceNotice: false, isBuffer: true };
}

function prepareDraft(source: RecipeDraft): RecipeDraft {
  return {
    ...source,
    ingredientComponents: source.ingredientComponents.length
      ? source.ingredientComponents.map((component) => ({
          ...component,
          ingredients: [
            ...component.ingredients.filter((ingredient) => !ingredient.isBuffer).map((ingredient) => ({ ...ingredient, unitId: ingredient.unitId ?? null })),
            ingredientBuffer(),
          ],
        }))
      : EMPTY_DRAFT.ingredientComponents,
    instructionComponents: source.instructionComponents.length
      ? source.instructionComponents.map((component) => ({
          ...component,
          steps: [...component.steps.filter((step) => !step.isBuffer), stepBuffer()],
        }))
      : EMPTY_DRAFT.instructionComponents,
  };
}

function meaningfulDraft(draft: RecipeDraft) {
  return {
    ...draft,
    ingredientComponents: draft.ingredientComponents.map((component) => ({
      ...component,
      ingredients: component.ingredients.filter((ingredient) => !ingredient.isBuffer),
    })),
    instructionComponents: draft.instructionComponents.map((component) => ({
      ...component,
      steps: component.steps.filter((step) => !step.isBuffer),
    })),
  };
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredDraft>;
  const draft = candidate.draft as Partial<RecipeDraft> | undefined;
  return candidate.version === 1
    && typeof candidate.updatedAt === "string"
    && typeof draft?.title === "string"
    && Array.isArray(draft.ingredientComponents)
    && Array.isArray(draft.instructionComponents);
}

function formatDraftTime(value: string | null): string {
  if (!value) return "Not saved locally yet";
  return `Saved locally at ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value))}`;
}

function moveRow<T>(rows: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const nextRows = [...rows];
  const [movedRow] = nextRows.splice(from, 1);
  nextRows.splice(to, 0, movedRow);
  return nextRows;
}

type SortableEditorRowProps = {
  children: ReactNode;
  className: string;
  handleLabel: string;
  id: string;
  index: number;
  disabled?: boolean;
};

function SortableEditorRow({ children, className, disabled = false, handleLabel, id, index }: SortableEditorRowProps) {
  const { handleRef, isDragging, ref } = useSortable({ disabled, id, index });

  return (
    <div className={`${className}${isDragging ? " is-dragging" : ""}`} ref={ref}>
      {disabled
        ? <span className="row-drag-placeholder" />
        : <button aria-label={handleLabel} className="row-drag-handle" ref={handleRef} title={handleLabel} type="button"><GripVertical aria-hidden="true" size={16} /></button>}
      {children}
    </div>
  );
}

type RecipeEditorClientProps = {
  initialDraft?: RecipeDraft;
  recipeId?: string;
};

export function RecipeEditorClient({ initialDraft = EMPTY_DRAFT, recipeId }: RecipeEditorClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storageKey = `picknic:recipe-draft:${recipeId ?? "new"}`;
  const preparedInitialDraft = useMemo(() => prepareDraft(initialDraft), [initialDraft]);
  const [draft, setDraft] = useState(preparedInitialDraft);
  const [tagsText, setTagsText] = useState(initialDraft.tags.join(", "));
  const [sourceText, setSourceText] = useState("");
  const [showImport, setShowImport] = useState(searchParams.get("method") === "copy-paste");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [savedLocallyAt, setSavedLocallyAt] = useState<string | null>(null);
  const [restoredDraftAt, setRestoredDraftAt] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [authoringSystem, setAuthoringSystem] = useState<MeasurementSystem>("metric");
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionsMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    setAuthoringSystem(inferMeasurementSystem(navigator.language));
  }, []);

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(storageKey);
      if (rawDraft) {
        const stored: unknown = JSON.parse(rawDraft);
        if (isStoredDraft(stored)) {
          setSavedLocallyAt(stored.updatedAt);
          if (JSON.stringify(meaningfulDraft(stored.draft)) !== JSON.stringify(meaningfulDraft(preparedInitialDraft))) {
            const restored = prepareDraft(stored.draft);
            setDraft(restored);
            setTagsText(restored.tags.join(", "));
            setRestoredDraftAt(stored.updatedAt);
          }
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setDraftReady(true);
    }
  }, [preparedInitialDraft, storageKey]);

  useEffect(() => {
    if (!draftReady) return;
    if (JSON.stringify(meaningfulDraft(draft)) === JSON.stringify(meaningfulDraft(preparedInitialDraft))) {
      window.localStorage.removeItem(storageKey);
      setSavedLocallyAt(null);
      return;
    }
    const timer = setTimeout(() => {
      const updatedAt = new Date().toISOString();
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, updatedAt, draft } satisfies StoredDraft));
        setSavedLocallyAt(updatedAt);
      } catch {
        setSavedLocallyAt(null);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [draft, draftReady, preparedInitialDraft, storageKey]);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  function showUndo(message: string, restore: () => void) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ message, restore });
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function clearRecipe() {
    const previousDraft = draft;
    const previousTags = tagsText;
    window.localStorage.removeItem(storageKey);
    setSavedLocallyAt(null);
    setRestoredDraftAt(null);
    setDraft(preparedInitialDraft);
    setTagsText(initialDraft.tags.join(", "));
    actionsMenuRef.current?.removeAttribute("open");
    showUndo(recipeId ? "Local changes discarded" : "Recipe cleared", () => {
      setDraft(previousDraft);
      setTagsText(previousTags);
    });
  }

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
        data?: {
          title: string;
          description: string;
          servings: number;
          tags: string[];
          measurementSystem: MeasurementSystem | null;
          ingredients: Array<{ name: string; quantity: number | null; unit: string | null }>;
          steps: string[];
        };
        error?: string;
      };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "We could not parse that recipe.");

      const parsed = payload.data;
      const parsedSystem = parsed.measurementSystem
        ?? inferSourceMeasurementSystem(parsed.ingredients.map((ingredient) => ingredient.unit), authoringSystem);
      const nextDraft: RecipeDraft = {
        ...draft,
        title: parsed.title,
        description: parsed.description,
        servings: parsed.servings,
        tags: parsed.tags,
        ingredientComponents: [{
          id: createId("ingredient-component"),
          name: "",
          ingredients: parsed.ingredients.map((ingredient) => {
            const normalizedUnit = normalizeUnitInput(ingredient.unit, parsedSystem);
            return {
              id: createId("ingredient"),
              ...ingredient,
              ...normalizedUnit,
              notes: "",
            };
          }),
        }],
        instructionComponents: [{
          id: createId("instruction-component"),
          name: "",
          steps: parsed.steps.map((instruction) => ({
            id: createId("step"),
            instruction,
            durationMinutes: null,
            advanceNotice: false,
          })),
        }],
      };
      setDraft(prepareDraft(nextDraft));
      setTagsText(parsed.tags.join(", "));
      setShowImport(false);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "We could not parse that recipe.");
    } finally {
      setIsParsing(false);
    }
  }

  function updateIngredient(componentId: string, ingredientId: string, patch: Partial<IngredientDraft>) {
    setDraft((current) => ({
      ...current,
      ingredientComponents: current.ingredientComponents.map((component) => {
        if (component.id !== componentId) return component;
        const currentIngredient = component.ingredients.find((ingredient) => ingredient.id === ingredientId);
        const consumedBuffer = Boolean(currentIngredient?.isBuffer)
          && Object.entries(patch).some(([key, value]) => key !== "isBuffer" && value !== "" && value !== null);
        const ingredients = component.ingredients.map((ingredient) =>
          ingredient.id === ingredientId ? { ...ingredient, ...patch, isBuffer: consumedBuffer ? false : ingredient.isBuffer } : ingredient,
        );
        return { ...component, ingredients: consumedBuffer ? [...ingredients, ingredientBuffer()] : ingredients };
      }),
    }));
  }

  function updateStep(componentId: string, stepId: string, patch: Partial<StepDraft>) {
    setDraft((current) => ({
      ...current,
      instructionComponents: current.instructionComponents.map((component) => {
        if (component.id !== componentId) return component;
        const currentStep = component.steps.find((step) => step.id === stepId);
        const consumedBuffer = Boolean(currentStep?.isBuffer)
          && Object.entries(patch).some(([key, value]) => key !== "isBuffer" && value !== "" && value !== null && value !== false);
        const steps = component.steps.map((step) =>
          step.id === stepId ? { ...step, ...patch, isBuffer: consumedBuffer ? false : step.isBuffer } : step,
        );
        return { ...component, steps: consumedBuffer ? [...steps, stepBuffer()] : steps };
      }),
    }));
  }

  function reorderIngredient(componentId: string, from: number, to: number) {
    setDraft((current) => ({
      ...current,
      ingredientComponents: current.ingredientComponents.map((component) => {
        if (component.id !== componentId) return component;
        const rows = component.ingredients.filter((ingredient) => !ingredient.isBuffer);
        const buffers = component.ingredients.filter((ingredient) => ingredient.isBuffer);
        return { ...component, ingredients: [...moveRow(rows, from, to), ...buffers] };
      }),
    }));
  }

  function reorderStep(componentId: string, from: number, to: number) {
    setDraft((current) => ({
      ...current,
      instructionComponents: current.instructionComponents.map((component) => {
        if (component.id !== componentId) return component;
        const rows = component.steps.filter((step) => !step.isBuffer);
        const buffers = component.steps.filter((step) => step.isBuffer);
        return { ...component, steps: [...moveRow(rows, from, to), ...buffers] };
      }),
    }));
  }

  function deleteIngredient(componentId: string, ingredientId: string) {
    const component = draft.ingredientComponents.find((item) => item.id === componentId);
    const index = component?.ingredients.findIndex((item) => item.id === ingredientId) ?? -1;
    const removed = component?.ingredients[index];
    if (!removed || removed.isBuffer) return;
    setDraft((current) => ({ ...current, ingredientComponents: current.ingredientComponents.map((item) => item.id === componentId ? { ...item, ingredients: item.ingredients.filter((ingredient) => ingredient.id !== ingredientId) } : item) }));
    showUndo("Ingredient removed", () => setDraft((current) => ({
      ...current,
      ingredientComponents: current.ingredientComponents.map((item) => item.id === componentId
        ? { ...item, ingredients: [...item.ingredients.slice(0, index), removed, ...item.ingredients.slice(index)] }
        : item),
    })));
  }

  function deleteStep(componentId: string, stepId: string) {
    const component = draft.instructionComponents.find((item) => item.id === componentId);
    const index = component?.steps.findIndex((item) => item.id === stepId) ?? -1;
    const removed = component?.steps[index];
    if (!removed || removed.isBuffer) return;
    setDraft((current) => ({ ...current, instructionComponents: current.instructionComponents.map((item) => item.id === componentId ? { ...item, steps: item.steps.filter((step) => step.id !== stepId) } : item) }));
    showUndo("Step removed", () => setDraft((current) => ({
      ...current,
      instructionComponents: current.instructionComponents.map((item) => item.id === componentId
        ? { ...item, steps: [...item.steps.slice(0, index), removed, ...item.steps.slice(index)] }
        : item),
    })));
  }

  function addIngredientComponent() {
    const id = createId("ingredient-component");
    setDraft((current) => ({ ...current, ingredientComponents: [...current.ingredientComponents, { id, name: "", ingredients: [ingredientBuffer()] }] }));
    requestAnimationFrame(() => document.getElementById(`${id}-name`)?.focus());
  }

  function addInstructionComponent() {
    const id = createId("instruction-component");
    setDraft((current) => ({ ...current, instructionComponents: [...current.instructionComponents, { id, name: "", steps: [stepBuffer()] }] }));
    requestAnimationFrame(() => document.getElementById(`${id}-name`)?.focus());
  }

  function deleteIngredientComponent(componentId: string) {
    if (draft.ingredientComponents.length === 1) return;
    const index = draft.ingredientComponents.findIndex((component) => component.id === componentId);
    const removed = draft.ingredientComponents[index];
    setDraft((current) => ({ ...current, ingredientComponents: current.ingredientComponents.filter((component) => component.id !== componentId) }));
    showUndo("Ingredient component removed", () => setDraft((current) => ({ ...current, ingredientComponents: [...current.ingredientComponents.slice(0, index), removed, ...current.ingredientComponents.slice(index)] })));
  }

  function deleteInstructionComponent(componentId: string) {
    if (draft.instructionComponents.length === 1) return;
    const index = draft.instructionComponents.findIndex((component) => component.id === componentId);
    const removed = draft.instructionComponents[index];
    setDraft((current) => ({ ...current, instructionComponents: current.instructionComponents.filter((component) => component.id !== componentId) }));
    showUndo("Instruction component removed", () => setDraft((current) => ({ ...current, instructionComponents: [...current.instructionComponents.slice(0, index), removed, ...current.instructionComponents.slice(index)] })));
  }

  async function saveRecipe() {
    if (!draft.title.trim()) return;
    setError(null);
    setIsSaving(true);
    const payload = {
      ...draft,
      ingredients: draft.ingredientComponents.flatMap((component, componentIndex) => component.ingredients
        .filter((ingredient) => !ingredient.isBuffer && ingredient.name.trim())
        .map((ingredient) => ({
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          unitId: ingredient.unitId,
          notes: ingredient.notes,
          component: component.name.trim() || null,
          componentId: component.id,
          componentPosition: componentIndex + 1,
        }))),
      steps: draft.instructionComponents.flatMap((component, componentIndex) => component.steps
        .filter((step) => !step.isBuffer && step.instruction.trim())
        .map((step) => ({
          instruction: step.instruction,
          durationMinutes: step.durationMinutes,
          advanceNotice: step.advanceNotice,
          component: component.name.trim() || null,
          componentId: component.id,
          componentPosition: componentIndex + 1,
        }))),
    };
    try {
      const response = await fetch(recipeId ? `/api/recipes/${recipeId}` : "/api/recipes", {
        method: recipeId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { data?: { id: string }; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error ?? "We could not save this recipe.");
      window.localStorage.removeItem(storageKey);
      router.push(`/recipes/${result.data.id}`);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "We could not save this recipe.");
    } finally {
      setIsSaving(false);
    }
  }

  const stepMinutes = draft.instructionComponents.reduce((total, component) => total + component.steps.reduce((componentTotal, step) => componentTotal + (step.durationMinutes ?? 0), 0), 0);
  const previewImageUrl = getSupportedRecipeImageUrl(draft.imageUrl);

  if (!draftReady) {
    return <div aria-busy="true" className="recipe-authoring recipe-authoring-loading"><div /><aside /></div>;
  }

  return (
    <div className="recipe-authoring">
      <div className="recipe-authoring-main">
        <header className="recipe-authoring-header">
          <Link className="recipe-authoring-back" href="/recipes"><ArrowLeft aria-hidden="true" size={18} /> <span>{recipeId ? "Edit recipe" : "Create recipe"}</span></Link>
          <div className="recipe-authoring-header-actions">
            <button className="recipe-paste-trigger" onClick={() => setShowImport((current) => !current)} type="button"><Sparkles aria-hidden="true" size={16} /> Paste recipe</button>
            <details className="recipe-authoring-actions-menu" ref={actionsMenuRef}>
              <summary aria-label="More recipe actions" title="More recipe actions"><MoreHorizontal aria-hidden="true" size={18} /></summary>
              <div><button onClick={clearRecipe} type="button"><Trash2 aria-hidden="true" size={16} /> {recipeId ? "Discard local changes" : "Clear recipe"}</button></div>
            </details>
          </div>
        </header>

        <section className="recipe-identity">
          <label className="sr-only" htmlFor="recipe-title">Recipe title</label>
          <textarea autoFocus id="recipe-title" maxLength={140} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Untitled recipe" rows={1} value={draft.title} />
          <label className="sr-only" htmlFor="recipe-description">Recipe description</label>
          <textarea id="recipe-description" maxLength={600} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Describe what makes this recipe worth cooking…" rows={2} value={draft.description} />
        </section>

        {showImport ? (
          <section className="recipe-import-panel">
            <div>
              <label htmlFor="recipe-source">Paste the recipe text</label>
              <button aria-label="Close paste recipe" onClick={() => setShowImport(false)} type="button"><X size={18} /></button>
            </div>
            <textarea id="recipe-source" onChange={(event) => setSourceText(event.target.value)} placeholder="Ingredients and instructions…" rows={7} value={sourceText} />
            <button className="app-theme-primary-button" disabled={isParsing || !sourceText.trim()} onClick={parseRecipe} type="button">
              {isParsing ? "Reading recipe…" : "Fill recipe details"}
            </button>
          </section>
        ) : null}

        <section className="recipe-writing-section">
          <div className="recipe-writing-heading"><h2>Ingredients</h2><button onClick={addIngredientComponent} type="button"><Plus size={17} /> Add component</button></div>
          <div className="recipe-component-list">
            {draft.ingredientComponents.map((component) => (
              <section className="recipe-component" key={component.id}>
                <div className="recipe-component-heading">
                  <label className="sr-only" htmlFor={`${component.id}-name`}>Ingredient component name</label>
                  <input id={`${component.id}-name`} maxLength={80} onChange={(event) => setDraft((current) => ({ ...current, ingredientComponents: current.ingredientComponents.map((item) => item.id === component.id ? { ...item, name: event.target.value } : item) }))} placeholder={draft.ingredientComponents.length > 1 ? "Name this component" : "Component name (optional)"} value={component.name} />
                  {draft.ingredientComponents.length > 1 ? <button aria-label={`Delete ${component.name || "ingredient"} component`} className="component-delete" onClick={() => deleteIngredientComponent(component.id)} type="button"><Trash2 size={16} /></button> : null}
                </div>
                <div className="ingredient-editor-table">
                  <div aria-hidden="true" className="ingredient-editor-labels"><span /><span>Qty</span><span>Unit</span><span>Ingredient</span><span>Notes</span><span /></div>
                  <DragDropProvider
                    onDragEnd={(event) => {
                      if (event.canceled) return;
                      const { source } = event.operation;
                      if (isSortable(source)) reorderIngredient(component.id, source.initialIndex, source.index);
                    }}
                  >
                    {component.ingredients.map((ingredient, index) => {
                      const fields = <>
                        <input aria-label={`Quantity for ingredient ${index + 1}`} min="0" onChange={(event) => updateIngredient(component.id, ingredient.id, { quantity: event.target.value ? Number(event.target.value) : null })} placeholder="Qty" step="0.01" type="number" value={ingredient.quantity ?? ""} />
                        <UnitCombobox label={`Unit for ingredient ${index + 1}`} onChange={(unit) => updateIngredient(component.id, ingredient.id, unit)} preferredSystem={authoringSystem} unitId={ingredient.unitId} value={ingredient.unit} />
                        <input aria-label={`Ingredient ${index + 1}`} maxLength={160} onChange={(event) => updateIngredient(component.id, ingredient.id, { name: event.target.value })} placeholder="Ingredient" value={ingredient.name} />
                        <input aria-label={`Notes for ingredient ${index + 1}`} maxLength={160} onChange={(event) => updateIngredient(component.id, ingredient.id, { notes: event.target.value })} placeholder="Notes" value={ingredient.notes} />
                        {!ingredient.isBuffer ? <button aria-label={`Delete ${ingredient.name || `ingredient ${index + 1}`}`} className="row-delete" onClick={() => deleteIngredient(component.id, ingredient.id)} type="button"><Trash2 size={16} /></button> : <span className="row-action-placeholder" />}
                      </>;

                      return <SortableEditorRow className={`ingredient-editor-row${ingredient.isBuffer ? " is-buffer" : ""}`} disabled={ingredient.isBuffer} handleLabel={`Reorder ${ingredient.name || `ingredient ${index + 1}`}`} id={ingredient.id} index={index} key={ingredient.id}>{fields}</SortableEditorRow>;
                    })}
                  </DragDropProvider>
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="recipe-writing-section recipe-instruction-editor">
          <div className="recipe-writing-heading"><h2>Instructions</h2><button onClick={addInstructionComponent} type="button"><Plus size={17} /> Add component</button></div>
          <div className="recipe-component-list">
            {draft.instructionComponents.map((component) => {
              const componentMinutes = component.steps.reduce((total, step) => total + (step.durationMinutes ?? 0), 0);
              return (
                <section className="recipe-component" key={component.id}>
                  <div className="recipe-component-heading instruction-component-heading">
                    <label className="sr-only" htmlFor={`${component.id}-name`}>Instruction component name</label>
                    <input id={`${component.id}-name`} maxLength={80} onChange={(event) => setDraft((current) => ({ ...current, instructionComponents: current.instructionComponents.map((item) => item.id === component.id ? { ...item, name: event.target.value } : item) }))} placeholder={draft.instructionComponents.length > 1 ? "Name this component" : "Component name (optional)"} value={component.name} />
                    {componentMinutes > 0 ? <span className="component-time"><Clock3 size={14} /> {componentMinutes} min</span> : null}
                    {draft.instructionComponents.length > 1 ? <button aria-label={`Delete ${component.name || "instruction"} component`} className="component-delete" onClick={() => deleteInstructionComponent(component.id)} type="button"><Trash2 size={16} /></button> : null}
                  </div>
                  <div className="step-editor-list">
                    <DragDropProvider
                      onDragEnd={(event) => {
                        if (event.canceled) return;
                        const { source } = event.operation;
                        if (isSortable(source)) reorderStep(component.id, source.initialIndex, source.index);
                      }}
                    >
                      {component.steps.map((step, index) => {
                        const fields = <>
                          <span className="step-number">{index + 1}</span>
                          <textarea aria-label={`Step ${index + 1}`} maxLength={1200} onChange={(event) => updateStep(component.id, step.id, { instruction: event.target.value })} placeholder="Add step…" rows={1} value={step.instruction} />
                          {!step.isBuffer ? (
                            <div className="step-meta">
                              <label><Clock3 aria-hidden="true" size={15} /><span className="sr-only">Minutes for step {index + 1}</span><input aria-label={`Minutes for step ${index + 1}`} max={MAX_RECIPE_MINUTES} min="1" onChange={(event) => updateStep(component.id, step.id, { durationMinutes: event.target.value === "" ? null : Math.min(MAX_RECIPE_MINUTES, Math.max(1, Number(event.target.value) || 1)) })} placeholder="min" type="number" value={step.durationMinutes ?? ""} /></label>
                              <button aria-label={`${step.advanceNotice ? "Remove" : "Add"} advance notice for step ${index + 1}`} aria-pressed={step.advanceNotice} className={step.advanceNotice ? "is-notice" : undefined} onClick={() => updateStep(component.id, step.id, { advanceNotice: !step.advanceNotice })} title="Needs advance notice" type="button"><BellRing size={16} /><span>{step.advanceNotice ? "Advance notice" : "Notice"}</span></button>
                              <button aria-label={`Delete step ${index + 1}`} className="step-delete" onClick={() => deleteStep(component.id, step.id)} type="button"><Trash2 size={16} /></button>
                            </div>
                          ) : <span className="row-action-placeholder" />}
                        </>;

                        return <SortableEditorRow className={`step-editor-row${step.isBuffer ? " is-buffer" : ""}`} disabled={step.isBuffer} handleLabel={`Reorder step ${index + 1}`} id={step.id} index={index} key={step.id}>{fields}</SortableEditorRow>;
                      })}
                    </DragDropProvider>
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="recipe-settings">
        <div className="recipe-image-preview">
          {previewImageUrl && !imageFailed
            ? <Image alt="Recipe preview" fill onError={() => setImageFailed(true)} sizes="(max-width: 1240px) 50vw, 360px" src={previewImageUrl} unoptimized />
            : <div><ImageIcon aria-hidden="true" size={26} /><span>{draft.imageUrl ? "Photo could not be loaded" : "Recipe photo preview"}</span></div>}
        </div>
        <div className="recipe-setting-fields">
          <label><span>Image URL</span><input onChange={(event) => { setImageFailed(false); setDraft((current) => ({ ...current, imageUrl: event.target.value })); }} placeholder="https://…" type="url" value={draft.imageUrl} /><small>Landscape images work best.</small></label>
          <label><span>Total time</span><div className="setting-icon-input"><Clock3 size={17} /><input max={MAX_RECIPE_MINUTES} min="1" onChange={(event) => setDraft((current) => ({ ...current, totalTimeMinutes: event.target.value === "" ? null : Math.min(MAX_RECIPE_MINUTES, Math.max(1, Number(event.target.value) || 1)) }))} placeholder="Minutes" type="number" value={draft.totalTimeMinutes ?? ""} /><span>min</span></div>{stepMinutes > 0 ? <small>Step times add up to {stepMinutes} min.</small> : null}</label>
          <fieldset className="servings-setting"><legend>Servings</legend><div><button aria-label="Decrease servings" disabled={draft.servings <= 1} onClick={() => setDraft((current) => ({ ...current, servings: Math.max(1, current.servings - 1) }))} type="button"><Minus size={17} /></button><strong>{draft.servings}</strong><button aria-label="Increase servings" onClick={() => setDraft((current) => ({ ...current, servings: current.servings + 1 }))} type="button"><Plus size={17} /></button></div></fieldset>
          <label><span>Tags</span><input maxLength={240} onChange={(event) => { const value = event.target.value; setTagsText(value); setDraft((current) => ({ ...current, tags: value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10) })); }} placeholder="Weeknight, chicken, one pot" value={tagsText} /><small>Separate up to 10 tags with commas.</small></label>
          {draft.tags.length ? <div aria-label="Recipe tags" className="recipe-setting-tags">{draft.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
          <label><span>Visibility</span><div className="setting-select"><span>{draft.visibility === RecipeVisibility.PUBLIC ? <Globe2 size={17} /> : <Users size={17} />}</span><select onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as RecipeVisibility }))} value={draft.visibility}><option value={RecipeVisibility.PRIVATE}>Household only</option><option value={RecipeVisibility.PUBLIC}>Everyone</option></select></div><small>{draft.visibility === RecipeVisibility.PUBLIC ? "Anyone can discover and save this recipe." : "Only people in your household can view it."}</small></label>
        </div>
        <div className="recipe-local-status">
          <span>
            <Check size={16} />
            Local draft
            <small>{restoredDraftAt ? `Restored draft from ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(restoredDraftAt))}` : formatDraftTime(savedLocallyAt)}</small>
          </span>
        </div>
        {error ? <p className="recipe-editor-error" role="alert">{error} Check the fields above and try again.</p> : null}
        <div className="recipe-save-actions">
          <button className="app-theme-primary-button" disabled={isSaving || !draft.title.trim()} onClick={saveRecipe} type="button">
            {isSaving ? "Saving recipe…" : recipeId ? "Save changes" : "Save recipe"}
          </button>
          <Link href={recipeId ? `/recipes/${recipeId}` : "/recipes"}>Cancel</Link>
        </div>
      </aside>

      {undo ?
        <div className="recipe-undo" role="status">
          <Check size={17} />
          <span>{undo.message}</span>
          <button onClick={() => { undo.restore(); setUndo(null); }} type="button">Undo</button>
          <button aria-label="Dismiss" onClick={() => setUndo(null)} type="button"><X size={16} /></button>
        </div>
      :null}
    </div>
  );
}
