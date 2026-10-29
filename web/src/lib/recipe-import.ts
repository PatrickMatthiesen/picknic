import { normalizeUnitInput, type MeasurementSystem } from "./units";

export type PicknicRecipeFile = {
  format: "picknic-recipe-v1";
  recipe: {
    title: string; description: string; notes: string; servings: number; totalTimeMinutes: number | null;
    tags: string[]; imageUrl: string; visibility: "PRIVATE" | "PUBLIC";
    ingredientComponents: Array<{ name: string; ingredients: Array<{ name: string; quantity: number | null; unit: string | null; unitId: string | null; notes: string }> }>;
    instructionComponents: Array<{ name: string; steps: Array<{ instruction: string; durationMinutes: number | null; advanceNotice: boolean }> }>;
  };
};
export function normalizeRecipeFileUnits(recipe: PicknicRecipeFile["recipe"], system: MeasurementSystem): PicknicRecipeFile["recipe"] {
  return {
    ...recipe,
    ingredientComponents: recipe.ingredientComponents.map(component => ({
      ...component,
      ingredients: component.ingredients.map(ingredient => ({
        ...ingredient,
        ...normalizeUnitInput(ingredient.unit, system, ingredient.unitId),
      })),
    })),
  };
}

const record = (x: unknown): x is Record<string, unknown> => Boolean(x && typeof x === "object" && !Array.isArray(x));
const string = (x: unknown) => typeof x === "string";
const numberOrNull = (x: unknown) => x === null || (typeof x === "number" && Number.isFinite(x));
export function validatePicknicRecipeFile(value: unknown): value is PicknicRecipeFile {
  if (!record(value) || value.format !== "picknic-recipe-v1" || !record(value.recipe)) return false;
  const r = value.recipe;
  if (!string(r.title) || !string(r.description) || !string(r.notes) || !Number.isInteger(r.servings) || (r.servings as number) < 1
    || !numberOrNull(r.totalTimeMinutes) || !Array.isArray(r.tags) || !r.tags.every(string) || !string(r.imageUrl)
    || (r.visibility !== "PRIVATE" && r.visibility !== "PUBLIC") || !Array.isArray(r.ingredientComponents)
    || !r.ingredientComponents.length || !Array.isArray(r.instructionComponents) || !r.instructionComponents.length) return false;
  for (const component of r.ingredientComponents) {
    if (!record(component) || !string(component.name) || !Array.isArray(component.ingredients)) return false;
    for (const ingredient of component.ingredients) {
      if (!record(ingredient) || !string(ingredient.name) || !numberOrNull(ingredient.quantity)
        || !(ingredient.unit === null || string(ingredient.unit)) || !(ingredient.unitId === null || string(ingredient.unitId)) || !string(ingredient.notes)) return false;
    }
  }
  for (const component of r.instructionComponents) {
    if (!record(component) || !string(component.name) || !Array.isArray(component.steps)) return false;
    for (const step of component.steps) {
      if (!record(step) || !string(step.instruction) || !numberOrNull(step.durationMinutes) || typeof step.advanceNotice !== "boolean") return false;
    }
  }
  return true;
}

export function isPrivateImportAddress(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  if (octets.length === 4 && octets.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)) {
    const [a, b, c] = octets;
    return a === 0 || a === 10 || a === 127 || a! >= 224 || (a === 169 && b === 254)
      || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168)
      || (a === 100 && b! >= 64 && b! <= 127) || (a === 192 && b === 0 && c === 0)
      || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113);
  }
  const v = ip.toLowerCase().split("%", 1)[0]!;
  const mapped = v.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateImportAddress(mapped[1]!);
  const halves = v.split("::");
  const left = halves[0] ? halves[0]!.split(":") : [];
  const right = halves[1] ? halves[1]!.split(":") : [];
  const words = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : v.split(":");
  if (words.length === 8 && words.slice(0, 5).every((word) => word === "0") && words[5] === "ffff") {
    const hi = Number.parseInt(words[6]!, 16), lo = Number.parseInt(words[7]!, 16);
    return isPrivateImportAddress(`${hi >>> 8}.${hi & 255}.${lo >>> 8}.${lo & 255}`);
  }
  return !/^[23][0-9a-f]{0,3}:/.test(v) || v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || /^fe[89ab]/.test(v)
    || v.startsWith("2001:db8:") || v.startsWith("2001:10:") || v.startsWith("2001:20:");
}

export function safeRecipeUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if ((url.port && url.port !== "443") || url.protocol !== "https:" || url.username || url.password || host.endsWith(".")
      || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")
      || /^\d+(\.\d+){3}$/.test(host) || host.includes(":")) return null;
    return url;
  } catch { return null; }
}

export function extractRecipeJsonLd(html: string): string | null {
  const recipe = findRecipeJsonLd(html);
  if (!recipe) return null;
  const ingredients = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient.filter(string) : [];
  const instructionValues = Array.isArray(recipe.recipeInstructions) ? recipe.recipeInstructions : [recipe.recipeInstructions];
  const instructions = instructionValues.map((step) => typeof step === "string" ? step : record(step) && (string(step.text) ? step.text : string(step.name) ? step.name : "")).filter(Boolean);
  return [recipe.name, recipe.description, `Servings: ${Array.isArray(recipe.recipeYield) ? recipe.recipeYield.join(", ") : recipe.recipeYield ?? ""}`, `Ingredients:\n${ingredients.join("\n")}`, `Instructions:\n${instructions.join("\n")}`].filter(string).join("\n\n").slice(0, 30_000);
}

function findRecipeJsonLd(html: string): Record<string, unknown> | null {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];
  for (const [, raw] of scripts) {
    try {
      const data: unknown = JSON.parse(raw!.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
      const stack: unknown[] = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const value = stack.pop();
        if (!record(value)) { if (Array.isArray(value)) stack.push(...value); continue; }
        if (value["@graph"]) stack.push(value["@graph"]);
        const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
        if (types.includes("Recipe")) return value;
        stack.push(...Object.values(value));
      }
    } catch { /* Ignore malformed metadata and keep looking. */ }
  }
  return null;
}

function minutesFromIsoDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)$/i);
  if (!match) return null;
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0) + Math.round(Number(match[3] ?? 0) / 60);
  return minutes > 0 && minutes <= 1440 ? minutes : null;
}

function instructionComponents(value: unknown): PicknicRecipeFile["recipe"]["instructionComponents"] {
  const groups: PicknicRecipeFile["recipe"]["instructionComponents"] = [];
  const visit = (items: unknown[], groupName = "") => {
    for (const item of items) {
      if (typeof item === "string") {
        if (item.trim()) {
          const group = groups.find((candidate) => candidate.name === groupName) ?? { name: groupName, steps: [] };
          if (!groups.includes(group)) groups.push(group);
          group.steps.push({ instruction: item.trim(), durationMinutes: null, advanceNotice: false });
        }
        continue;
      }
      if (!record(item)) continue;
      const type = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
      const name = string(item.name) ? item.name.trim() : "";
      const children = Array.isArray(item.itemListElement) ? item.itemListElement : null;
      if (children) visit(children, type.includes("HowToSection") ? name || groupName : groupName);
      else {
        const instruction = string(item.text) ? item.text : name;
        if (instruction.trim()) {
          const group = groups.find((candidate) => candidate.name === groupName) ?? { name: groupName, steps: [] };
          if (!groups.includes(group)) groups.push(group);
          group.steps.push({ instruction: instruction.trim(), durationMinutes: minutesFromIsoDuration(item.totalTime), advanceNotice: false });
        }
      }
    }
  };
  visit(Array.isArray(value) ? value : value == null ? [] : [value]);
  return groups.length ? groups : [{ name: "", steps: [] }];
}

export function extractStructuredRecipeJsonLd(html: string): PicknicRecipeFile | null {
  const value = findRecipeJsonLd(html);
  if (!value || !string(value.name) || !value.name.trim()) return null;
  const yields = Array.isArray(value.recipeYield) ? value.recipeYield[0] : value.recipeYield;
  const servingsMatch = typeof yields === "string" ? yields.match(/\d+/) : null;
  const servings = servingsMatch ? Math.min(100, Math.max(1, Number(servingsMatch[0]))) : typeof yields === "number" ? Math.min(100, Math.max(1, Math.floor(yields))) : 4;
  const tags = Array.isArray(value.keywords) ? value.keywords.filter(string) : typeof value.keywords === "string" ? value.keywords.split(",").map((tag) => tag.trim()).filter(Boolean) : [];
  const rawImage = Array.isArray(value.image) ? value.image[0] : value.image;
  const imageUrl = typeof rawImage === "string" ? rawImage : record(rawImage) && string(rawImage.url) ? rawImage.url : "";
  const rawIngredients = Array.isArray(value.recipeIngredient) ? value.recipeIngredient.filter(string) : [];
  return {
    format: "picknic-recipe-v1",
    recipe: {
      title: value.name.trim(), description: string(value.description) ? value.description.slice(0, 600) : "", notes: "", servings,
      totalTimeMinutes: minutesFromIsoDuration(value.totalTime), tags: tags.slice(0, 30), imageUrl, visibility: "PRIVATE",
      ingredientComponents: [{ name: "", ingredients: rawIngredients.map((name) => ({ name: name.slice(0, 300), quantity: null, unit: null, unitId: null, notes: "" })) }],
      instructionComponents: instructionComponents(value.recipeInstructions),
    },
  };
}
