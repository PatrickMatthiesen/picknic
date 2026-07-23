import { describe, expect, test } from "bun:test";
import {
  formatMeasurement,
  getRecipeUnitVocabulary,
  getUnitStorageKey,
  inferMeasurementSystem,
  inferSourceMeasurementSystem,
  normalizeUnitInput,
  resolveUnit,
  searchUnits,
} from "./units";

describe("recipe units", () => {
  test("normalizes aliases to one canonical unit", () => {
    expect(normalizeUnitInput(" tbs ")).toEqual({ unit: "tbsp", unitId: "metric-tablespoon" });
    expect(resolveUnit("tablespoons")?.id).toBe("metric-tablespoon");
    expect(resolveUnit("tbsp", "us")?.id).toBe("us-tablespoon");
  });

  test("keeps custom units without assigning a catalog id", () => {
    expect(normalizeUnitInput("small jar")).toEqual({ unit: "small jar", unitId: null });
  });

  test("recognizes common non-convertible recipe units", () => {
    expect(normalizeUnitInput("loaves")).toEqual({ unit: "loaf", unitId: "count-loaf" });
    expect(normalizeUnitInput("heads")).toEqual({ unit: "head", unitId: "count-head" });
  });

  test("builds model guidance from canonical and custom-friendly units", () => {
    const vocabulary = getRecipeUnitVocabulary();
    expect(vocabulary).toContain("pinch");
    expect(vocabulary).toContain("loaf");
    expect(vocabulary).toContain("head");
  });

  test("infers a display system from locale", () => {
    expect(inferMeasurementSystem("en-US")).toBe("us");
    expect(inferMeasurementSystem("da-DK")).toBe("metric");
  });

  test("offers explicit alternatives for ambiguous source units", () => {
    expect(searchUnits("cup", "metric").map((unit) => unit.id)).toEqual(["metric-cup", "us-cup"]);
    expect(searchUnits("gramme", "metric").map((unit) => unit.id)).toEqual(["metric-gram"]);
  });

  test("preserves an explicitly selected ambiguous unit", () => {
    expect(normalizeUnitInput("cup", "metric", "us-cup")).toEqual({ unit: "cup", unitId: "us-cup" });
  });

  test("keeps pantry identity separate for units with the same symbol", () => {
    expect(getUnitStorageKey("cup", "metric-cup")).toBe("metric-cup");
    expect(getUnitStorageKey("cup", "us-cup")).toBe("us-cup");
    expect(getUnitStorageKey(" Small Jar ", null)).toBe("unit:small jar");
  });

  test("uses unambiguous units to understand an imported recipe", () => {
    expect(inferSourceMeasurementSystem(["cups", "oz", "lb"], "metric")).toBe("us");
    expect(inferSourceMeasurementSystem(["cups", "g", "ml"], "us")).toBe("metric");
    expect(inferSourceMeasurementSystem(["cups"], "metric")).toBe("metric");
  });

  test("preserves original measurements and converts only for display", () => {
    expect(formatMeasurement(1, "cup", "us-cup", "original")).toMatchObject({ quantity: 1, unitSymbol: "cup", converted: false });
    expect(formatMeasurement(1, "cup", "us-cup", "metric")).toMatchObject({ quantity: 2.37, unitSymbol: "dl", converted: true });
    expect(formatMeasurement(8, "oz", "us-ounce", "metric")).toMatchObject({ quantity: 227, unitSymbol: "g", converted: true });
  });

  test("converts the unrounded scaled quantity", () => {
    expect(formatMeasurement(1, "cup", "us-cup", "metric", 1 / 3)).toMatchObject({
      quantity: 78.9,
      unitSymbol: "ml",
      converted: true,
    });
  });
});
