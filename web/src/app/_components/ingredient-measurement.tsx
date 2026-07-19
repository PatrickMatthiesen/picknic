"use client";

import { useSyncExternalStore } from "react";
import {
  formatMeasurement,
  formatMeasurementQuantity,
  inferMeasurementSystem,
  type MeasurementPreference,
} from "@/lib/units";

const PREFERENCE_KEY = "picknic:measurement-preference";
const PREFERENCE_EVENT = "picknic:measurement-preference-change";

function getPreferenceSnapshot(): MeasurementPreference {
  const stored = window.localStorage.getItem(PREFERENCE_KEY);
  return stored === "original" || stored === "metric" || stored === "us"
    ? stored
    : inferMeasurementSystem(navigator.language);
}

function subscribeToPreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PREFERENCE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PREFERENCE_EVENT, onStoreChange);
  };
}

export function useMeasurementPreference() {
  const preference = useSyncExternalStore<MeasurementPreference>(
    subscribeToPreference,
    getPreferenceSnapshot,
    () => "metric",
  );

  function updatePreference(value: MeasurementPreference) {
    window.localStorage.setItem(PREFERENCE_KEY, value);
    window.dispatchEvent(new Event(PREFERENCE_EVENT));
  }

  return [preference, updatePreference] as const;
}

export function MeasurementPreferenceSelect({
  onChange,
  value,
}: {
  onChange: (value: MeasurementPreference) => void;
  value: MeasurementPreference;
}) {
  return (
    <label className="measurement-preference">
      <span>Units</span>
      <select aria-label="Ingredient units" onChange={(event) => onChange(event.target.value as MeasurementPreference)} value={value}>
        <option value="original">Original recipe</option>
        <option value="metric">Metric</option>
        <option value="us">US customary</option>
      </select>
    </label>
  );
}

function UnitTerm({ name, symbol }: { name: string | null; symbol: string }) {
  if (!name) return <span>{symbol}</span>;

  return (
    <span aria-label={`${symbol}, ${name}`} className="unit-term" tabIndex={0}>
      <abbr>{symbol}</abbr>
      <span className="unit-tooltip" role="tooltip">{name}</span>
    </span>
  );
}

export function IngredientMeasurement({
  multiplier = 1,
  preference,
  quantity,
  unit,
  unitId,
}: {
  multiplier?: number;
  preference: MeasurementPreference;
  quantity: number | null;
  unit: string | null;
  unitId?: string | null;
}) {
  const measurement = formatMeasurement(quantity, unit, unitId, preference, multiplier);

  return (
    <span className="ingredient-measurement">
      {formatMeasurementQuantity(measurement.quantity)}
      {measurement.quantity !== null && measurement.unitSymbol ? " " : null}
      {measurement.unitSymbol ? <UnitTerm name={measurement.unitName} symbol={measurement.unitSymbol} /> : null}
    </span>
  );
}
