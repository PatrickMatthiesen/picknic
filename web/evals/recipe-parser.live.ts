import { getAiRecipeImportStatus } from "../src/lib/ai-config";
import {
  parseRecipeWithAi,
  RECIPE_REASONING_EFFORT,
  type ParsedRecipeDraft,
} from "../src/lib/recipe-parser";
import { resolve } from "node:path";

type EvalCase = {
  name: string;
  input: string;
  validate: (recipe: ParsedRecipeDraft) => string[];
};

type ParsedIngredient = ParsedRecipeDraft["ingredientComponents"][number]["ingredients"][number];

function normalized(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function ingredients(recipe: ParsedRecipeDraft): ParsedIngredient[] {
  return recipe.ingredientComponents.flatMap((component) => component.ingredients);
}

function findIngredient(recipe: ParsedRecipeDraft, namePart: string): ParsedIngredient | undefined {
  const expected = normalized(namePart);
  return ingredients(recipe).find((ingredient) => normalized(ingredient.name).includes(expected));
}

function requireIngredient(
  recipe: ParsedRecipeDraft,
  namePart: string,
  validate: (ingredient: ParsedIngredient) => boolean,
  expectation: string,
): string[] {
  const ingredient = findIngredient(recipe, namePart);
  if (!ingredient) return [`Missing ingredient containing "${namePart}".`];
  return validate(ingredient) ? [] : [`${ingredient.name}: expected ${expectation}, received ${JSON.stringify(ingredient)}.`];
}

const cases: EvalCase[] = [
  {
    name: "qualitative-and-custom-units",
    input: [
      "Pantry slaw",
      "Serves 4",
      "",
      "Ingredients",
      "Tiny pinch of granulated sugar",
      "Kosher salt, to taste",
      "1 small jar wholegrain mustard",
      "1 head green cabbage, finely shredded",
      "",
      "Directions",
      "Mix everything together and serve.",
    ].join("\n"),
    validate(recipe) {
      return [
        ...requireIngredient(
          recipe,
          "sugar",
          (ingredient) => ingredient.quantity === null
            && normalized(ingredient.unit) === "pinch"
            && normalized(ingredient.notes).includes("tiny"),
          "quantity null, unit pinch, and notes containing tiny",
        ),
        ...requireIngredient(
          recipe,
          "salt",
          (ingredient) => ingredient.quantity === null
            && ingredient.unit === null
            && normalized(ingredient.notes).includes("taste"),
          "quantity and unit null, with to-taste notes",
        ),
        ...requireIngredient(
          recipe,
          "mustard",
          (ingredient) => ingredient.quantity === 1
            && normalized(ingredient.unit) === "jar"
            && normalized(ingredient.notes).includes("small"),
          "quantity 1, custom unit jar, and notes containing small",
        ),
        ...requireIngredient(
          recipe,
          "cabbage",
          (ingredient) => ingredient.quantity === 1 && normalized(ingredient.unit) === "head",
          "quantity 1 and canonical unit head",
        ),
      ];
    },
  },
  {
    name: "timing-notes-and-advance-notice",
    input: [
      "Overnight breakfast rolls",
      "Prep: 15 min",
      "Cook: 25 min",
      "Serves: 6",
      "",
      "Ingredients",
      "500 g bread flour",
      "7 g instant yeast",
      "300 ml water",
      "",
      "Directions",
      "Mix the dough, cover, and refrigerate overnight.",
      "The next morning, bake for 20-25 minutes.",
      "",
      "Notes",
      "Wholemeal flour can replace up to half of the bread flour.",
    ].join("\n"),
    validate(recipe) {
      const steps = recipe.instructionComponents.flatMap((component) => component.steps);
      const overnight = steps.find((step) => normalized(step.instruction).includes("overnight"));
      const bake = steps.find((step) => normalized(step.instruction).includes("bake"));
      const errors: string[] = [];
      if (recipe.totalTimeMinutes !== 40) errors.push(`Expected total time 40, received ${recipe.totalTimeMinutes}.`);
      if (!overnight?.advanceNotice) errors.push("Expected the overnight step to require advance notice.");
      if (bake?.durationMinutes !== 25) errors.push(`Expected bake duration 25, received ${bake?.durationMinutes ?? "missing"}.`);
      if (!normalized(recipe.notes).includes("wholemeal")) errors.push("Expected the substitution to remain in recipe notes.");
      return errors;
    },
  },
  {
    name: "component-groups",
    input: [
      "Quick filled flatbreads",
      "Serves 2",
      "",
      "Dough",
      "2 cups flour",
      "1 pinch salt",
      "",
      "Filling",
      "1 handful spinach",
      "4 pieces sun-dried tomato",
      "",
      "Directions",
      "Dough: Mix the flour and salt.",
      "Assembly: Fill each flatbread with spinach and tomato, then fold.",
    ].join("\n"),
    validate(recipe) {
      const ingredientGroups = recipe.ingredientComponents.map((component) => normalized(component.name));
      const instructionGroups = recipe.instructionComponents.map((component) => normalized(component.name));
      const errors: string[] = [];
      if (!ingredientGroups.some((name) => name.includes("dough"))) errors.push("Missing Dough ingredient component.");
      if (!ingredientGroups.some((name) => name.includes("filling"))) errors.push("Missing Filling ingredient component.");
      if (instructionGroups.length < 2) errors.push("Expected separate instruction components.");
      return errors;
    },
  },
];

if (process.env.RUN_AI_EVALS !== "1") {
  console.error([
    "Live AI recipe evaluations are disabled.",
    "Start Aspire, then opt in explicitly:",
    "  $env:RUN_AI_EVALS='1'; bun run test:ai",
    "Optionally run selected cases:",
    "  $env:AI_EVAL_CASE='qualitative-and-custom-units'; $env:RUN_AI_EVALS='1'; bun run test:ai",
  ].join("\n"));
  process.exit(2);
}

function discoverAspireAiBaseUrl(): string | null {
  const result = Bun.spawnSync({
    cmd: ["aspire", "resources", "ai-proxy", "--format", "Json", "--non-interactive"],
    cwd: resolve(import.meta.dir, "../.."),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) return null;

  const output = result.stdout.toString();
  const jsonStart = output.indexOf("{");
  const jsonEnd = output.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) return null;

  try {
    const description = JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as {
      resources?: Array<{
        urls?: Array<{ name?: string; url?: string }>;
      }>;
    };
    const endpoint = description.resources?.[0]?.urls?.[0]?.url;
    return endpoint ? `${endpoint.replace(/\/+$/, "")}/v1` : null;
  } catch {
    return null;
  }
}

process.env.AI_BASE_URL ||= discoverAspireAiBaseUrl() ?? "http://localhost:8317/v1";
process.env.AI_API_KEY ||= "picknic-local-ai";

const selectedNames = new Set(
  (process.env.AI_EVAL_CASE ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);
const selectedCases = selectedNames.size > 0
  ? cases.filter((testCase) => selectedNames.has(testCase.name))
  : cases;

if (selectedCases.length === 0) {
  console.error(`No matching AI eval cases. Available cases: ${cases.map((testCase) => testCase.name).join(", ")}`);
  process.exit(2);
}

const status = await getAiRecipeImportStatus();
if (!status.available || !status.model) {
  console.error("No AI model is available. Start Aspire and complete provider login before running live evaluations.");
  process.exit(2);
}

console.log(`Running ${selectedCases.length} live AI recipe eval(s) with ${status.model} at ${RECIPE_REASONING_EFFORT} reasoning.`);

let failed = 0;
for (const testCase of selectedCases) {
  const startedAt = performance.now();
  try {
    const recipe = await parseRecipeWithAi(testCase.input);
    const errors = testCase.validate(recipe);
    const durationSeconds = ((performance.now() - startedAt) / 1_000).toFixed(1);
    if (errors.length === 0) {
      console.log(`PASS ${testCase.name} (${durationSeconds}s)`);
    } else {
      failed += 1;
      console.error(`FAIL ${testCase.name} (${durationSeconds}s)\n  ${errors.join("\n  ")}`);
    }
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR ${testCase.name}: ${message}`);
  }
}

if (failed > 0) {
  console.error(`${failed} of ${selectedCases.length} live AI recipe eval(s) failed.`);
  process.exit(1);
}

console.log(`All ${selectedCases.length} live AI recipe eval(s) passed.`);
