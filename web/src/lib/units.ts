export type MeasurementSystem = "metric" | "us";
export type MeasurementPreference = "original" | MeasurementSystem;
export type UnitDimension = "count" | "mass" | "volume";

export type UnitDefinition = {
  aliases: readonly string[];
  dimension: UnitDimension;
  factorToBase: number | null;
  id: string;
  name: string;
  symbol: string;
  system: MeasurementSystem | "neutral";
};

const UNIT_CATALOG = [
  { id: "metric-milligram", dimension: "mass", system: "metric", symbol: "mg", name: "milligram", aliases: ["mg", "milligram", "milligrams"], factorToBase: 0.001 },
  { id: "metric-gram", dimension: "mass", system: "metric", symbol: "g", name: "gram", aliases: ["g", "gr", "gram", "grams", "gramme", "grammes"], factorToBase: 1 },
  { id: "metric-kilogram", dimension: "mass", system: "metric", symbol: "kg", name: "kilogram", aliases: ["kg", "kilo", "kilos", "kilogram", "kilograms"], factorToBase: 1000 },
  { id: "us-ounce", dimension: "mass", system: "us", symbol: "oz", name: "ounce", aliases: ["oz", "ounce", "ounces"], factorToBase: 28.349523125 },
  { id: "us-pound", dimension: "mass", system: "us", symbol: "lb", name: "pound", aliases: ["lb", "lbs", "pound", "pounds"], factorToBase: 453.59237 },
  { id: "metric-milliliter", dimension: "volume", system: "metric", symbol: "ml", name: "milliliter", aliases: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"], factorToBase: 1 },
  { id: "metric-centiliter", dimension: "volume", system: "metric", symbol: "cl", name: "centiliter", aliases: ["cl", "centiliter", "centiliters", "centilitre", "centilitres"], factorToBase: 10 },
  { id: "metric-deciliter", dimension: "volume", system: "metric", symbol: "dl", name: "deciliter", aliases: ["dl", "deciliter", "deciliters", "decilitre", "decilitres"], factorToBase: 100 },
  { id: "metric-liter", dimension: "volume", system: "metric", symbol: "l", name: "liter", aliases: ["l", "liter", "liters", "litre", "litres"], factorToBase: 1000 },
  { id: "metric-teaspoon", dimension: "volume", system: "metric", symbol: "tsp", name: "teaspoon", aliases: ["tsp", "tsp.", "teaspoon", "teaspoons", "tsk", "tsk."], factorToBase: 5 },
  { id: "metric-tablespoon", dimension: "volume", system: "metric", symbol: "tbsp", name: "tablespoon", aliases: ["tbsp", "tbsp.", "tbs", "tbs.", "tablespoon", "tablespoons", "spsk", "spsk."], factorToBase: 15 },
  { id: "metric-cup", dimension: "volume", system: "metric", symbol: "cup", name: "metric cup", aliases: ["cup", "cups", "metric cup", "metric cups"], factorToBase: 250 },
  { id: "us-teaspoon", dimension: "volume", system: "us", symbol: "tsp", name: "teaspoon", aliases: ["tsp", "tsp.", "teaspoon", "teaspoons"], factorToBase: 4.92892159375 },
  { id: "us-tablespoon", dimension: "volume", system: "us", symbol: "tbsp", name: "tablespoon", aliases: ["tbsp", "tbsp.", "tbs", "tbs.", "tablespoon", "tablespoons"], factorToBase: 14.78676478125 },
  { id: "us-fluid-ounce", dimension: "volume", system: "us", symbol: "fl oz", name: "fluid ounce", aliases: ["fl oz", "fl. oz.", "fluid ounce", "fluid ounces"], factorToBase: 29.5735295625 },
  { id: "us-cup", dimension: "volume", system: "us", symbol: "cup", name: "US cup", aliases: ["c", "cup", "cups", "us cup", "us cups"], factorToBase: 236.5882365 },
  { id: "us-pint", dimension: "volume", system: "us", symbol: "pt", name: "US pint", aliases: ["pt", "pint", "pints", "us pint", "us pints"], factorToBase: 473.176473 },
  { id: "us-quart", dimension: "volume", system: "us", symbol: "qt", name: "US quart", aliases: ["qt", "quart", "quarts", "us quart", "us quarts"], factorToBase: 946.352946 },
  { id: "us-gallon", dimension: "volume", system: "us", symbol: "gal", name: "US gallon", aliases: ["gal", "gallon", "gallons", "us gallon", "us gallons"], factorToBase: 3785.411784 },
  { id: "count-piece", dimension: "count", system: "neutral", symbol: "piece", name: "piece", aliases: ["piece", "pieces", "pc", "pcs", "each"], factorToBase: null },
  { id: "count-clove", dimension: "count", system: "neutral", symbol: "clove", name: "clove", aliases: ["clove", "cloves"], factorToBase: null },
  { id: "count-can", dimension: "count", system: "neutral", symbol: "can", name: "can", aliases: ["can", "cans", "tin", "tins"], factorToBase: null },
  { id: "count-bunch", dimension: "count", system: "neutral", symbol: "bunch", name: "bunch", aliases: ["bunch", "bunches"], factorToBase: null },
  { id: "count-pinch", dimension: "count", system: "neutral", symbol: "pinch", name: "pinch", aliases: ["pinch", "pinches"], factorToBase: null },
  { id: "count-handful", dimension: "count", system: "neutral", symbol: "handful", name: "handful", aliases: ["handful", "handfuls"], factorToBase: null },
] as const satisfies readonly UnitDefinition[];

const unitById = new Map<string, UnitDefinition>(UNIT_CATALOG.map((unit) => [unit.id, unit]));
const unitsByAlias = new Map<string, UnitDefinition[]>();

function normalizeAlias(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll(".", "").replace(/\s+/g, " ");
}

for (const unit of UNIT_CATALOG) {
  for (const alias of new Set([unit.symbol, unit.name, ...unit.aliases])) {
    const key = normalizeAlias(alias);
    const matches = unitsByAlias.get(key) ?? [];
    matches.push(unit);
    unitsByAlias.set(key, matches);
  }
}

export function getUnitById(id: string | null | undefined): UnitDefinition | null {
  return id ? unitById.get(id) ?? null : null;
}

export function resolveUnit(value: string | null | undefined, preferredSystem: MeasurementSystem = "metric"): UnitDefinition | null {
  if (!value?.trim()) return null;
  const matches = unitsByAlias.get(normalizeAlias(value));
  if (!matches?.length) return null;
  return matches.find((unit) => unit.system === preferredSystem) ?? matches.find((unit) => unit.system === "neutral") ?? matches[0];
}

function unitMatchesInput(unit: UnitDefinition, value: string): boolean {
  const input = normalizeAlias(value);
  return [unit.symbol, unit.name, ...unit.aliases].some((candidate) => normalizeAlias(candidate) === input);
}

export function normalizeUnitInput(
  value: string | null | undefined,
  preferredSystem: MeasurementSystem = "metric",
  currentUnitId?: string | null,
) {
  const unitText = value?.trim() || null;
  const currentUnit = getUnitById(currentUnitId);
  const definition = currentUnit && unitText && unitMatchesInput(currentUnit, unitText)
    ? currentUnit
    : resolveUnit(unitText, preferredSystem);
  return {
    unit: definition?.symbol ?? unitText,
    unitId: definition?.id ?? null,
  };
}

export function inferMeasurementSystem(locale: string | null | undefined): MeasurementSystem {
  try {
    const region = locale ? new Intl.Locale(locale).maximize().region : null;
    return region === "US" || region === "LR" || region === "MM" ? "us" : "metric";
  } catch {
    return "metric";
  }
}

export function inferSourceMeasurementSystem(
  values: Array<string | null | undefined>,
  fallback: MeasurementSystem,
): MeasurementSystem {
  let metricSignals = 0;
  let usSignals = 0;

  for (const value of values) {
    if (!value?.trim()) continue;
    const matches = unitsByAlias.get(normalizeAlias(value)) ?? [];
    const systems = new Set(matches.map((unit) => unit.system).filter((system) => system !== "neutral"));
    if (systems.size !== 1) continue;
    if (systems.has("metric")) metricSignals += 1;
    if (systems.has("us")) usSignals += 1;
  }

  if (metricSignals === usSignals) return fallback;
  return usSignals > metricSignals ? "us" : "metric";
}

const COMMON_UNITS: Record<MeasurementSystem, readonly string[]> = {
  metric: ["metric-gram", "metric-kilogram", "metric-milliliter", "metric-deciliter", "metric-liter", "metric-tablespoon", "metric-teaspoon", "count-piece"],
  us: ["us-cup", "us-tablespoon", "us-teaspoon", "us-ounce", "us-pound", "us-fluid-ounce", "count-piece"],
};

function systemRank(unit: UnitDefinition, preferredSystem: MeasurementSystem): number {
  return unit.system === preferredSystem ? 0 : unit.system === "neutral" ? 1 : 2;
}

function unitMatchScore(unit: UnitDefinition, query: string): number | null {
  const normalizedQuery = normalizeAlias(query);
  const values = [unit.symbol, unit.name, ...unit.aliases].map(normalizeAlias);
  if (values.some((value) => value === normalizedQuery)) return 0;
  if (values.some((value) => value.startsWith(normalizedQuery))) return 1;
  if (values.some((value) => value.includes(normalizedQuery))) return 2;
  return null;
}

export function searchUnits(
  query: string,
  preferredSystem: MeasurementSystem,
  recentUnitIds: readonly string[] = [],
  limit = 6,
): UnitDefinition[] {
  if (!query.trim()) {
    const ids = [...recentUnitIds, ...COMMON_UNITS[preferredSystem]];
    return Array.from(new Set(ids))
      .map((id) => getUnitById(id))
      .filter((unit): unit is UnitDefinition => unit !== null)
      .slice(0, limit);
  }

  const matches: Array<{ unit: UnitDefinition; score: number }> = [];
  for (const unit of UNIT_CATALOG) {
    const score = unitMatchScore(unit, query);
    if (score !== null) matches.push({ unit, score });
  }

  return matches
    .sort((left, right) => left.score - right.score
      || systemRank(left.unit, preferredSystem) - systemRank(right.unit, preferredSystem)
      || left.unit.name.localeCompare(right.unit.name))
    .slice(0, limit)
    .map((result) => result.unit);
}

function preferredTargetUnit(dimension: UnitDimension, baseValue: number, system: MeasurementSystem): UnitDefinition | null {
  if (system === "metric") {
    if (dimension === "mass") return getUnitById(Math.abs(baseValue) >= 1000 ? "metric-kilogram" : "metric-gram");
    if (dimension === "volume") {
      if (Math.abs(baseValue) >= 1000) return getUnitById("metric-liter");
      if (Math.abs(baseValue) >= 100) return getUnitById("metric-deciliter");
      return getUnitById("metric-milliliter");
    }
  }

  if (system === "us") {
    if (dimension === "mass") return getUnitById(Math.abs(baseValue) >= 453.59237 ? "us-pound" : "us-ounce");
    if (dimension === "volume") {
      if (Math.abs(baseValue) >= 236.5882365) return getUnitById("us-cup");
      if (Math.abs(baseValue) >= 29.5735295625) return getUnitById("us-fluid-ounce");
      if (Math.abs(baseValue) >= 14.78676478125) return getUnitById("us-tablespoon");
      return getUnitById("us-teaspoon");
    }
  }

  return null;
}

function roundMeasurement(value: number): number {
  const absolute = Math.abs(value);
  const decimals = absolute >= 100 ? 0 : absolute >= 10 ? 1 : 2;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export type FormattedMeasurement = {
  converted: boolean;
  quantity: number | null;
  unitId: string | null;
  unitName: string | null;
  unitSymbol: string | null;
};

export function formatMeasurement(
  quantity: number | null,
  unitText: string | null,
  unitId: string | null | undefined,
  preference: MeasurementPreference,
  multiplier = 1,
): FormattedMeasurement {
  const scaledQuantity = quantity == null ? null : roundMeasurement(quantity * multiplier);
  const source = getUnitById(unitId) ?? resolveUnit(unitText);

  if (preference === "original" || !source) {
    return {
      converted: false,
      quantity: scaledQuantity,
      unitId: source?.id ?? null,
      unitName: source?.name ?? null,
      unitSymbol: unitText?.trim() || null,
    };
  }

  if (source.system === "neutral" || source.system === preference || source.factorToBase === null || scaledQuantity === null) {
    return {
      converted: false,
      quantity: scaledQuantity,
      unitId: source.id,
      unitName: source.name,
      unitSymbol: source.symbol,
    };
  }

  const baseValue = scaledQuantity * source.factorToBase;
  const target = preferredTargetUnit(source.dimension, baseValue, preference);
  if (!target?.factorToBase) {
    return { converted: false, quantity: scaledQuantity, unitId: source.id, unitName: source.name, unitSymbol: source.symbol };
  }

  return {
    converted: true,
    quantity: roundMeasurement(baseValue / target.factorToBase),
    unitId: target.id,
    unitName: target.name,
    unitSymbol: target.symbol,
  };
}

export function formatMeasurementQuantity(value: number | null, locale?: string): string {
  if (value === null) return "";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}
