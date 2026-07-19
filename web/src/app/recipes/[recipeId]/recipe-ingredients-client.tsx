"use client";

import {
  IngredientMeasurement,
  MeasurementPreferenceSelect,
  useMeasurementPreference,
} from "@/app/_components/ingredient-measurement";

type Ingredient = {
  id: string;
  name: string;
  notes: string | null;
  quantity: number | null;
  unit: string | null;
  unitId: string | null;
};

type IngredientGroup = { component: string; ingredients: Ingredient[]; key: string };

export function RecipeIngredientsClient({ groups }: { groups: IngredientGroup[] }) {
  const [preference, setPreference] = useMeasurementPreference();

  return (
    <aside>
      <header className="recipe-ingredient-heading">
        <h2>Ingredients</h2>
        <MeasurementPreferenceSelect onChange={setPreference} value={preference} />
      </header>
      {groups.map((group) => (
        <section key={group.key}>
          {groups.length > 1 ? <h3>{group.component}</h3> : null}
          <ul>{group.ingredients.map((ingredient) => (
            <li key={ingredient.id}>
              <span>{ingredient.name}{ingredient.notes ? <small>{ingredient.notes}</small> : null}</span>
              <strong><IngredientMeasurement preference={preference} quantity={ingredient.quantity} unit={ingredient.unit} unitId={ingredient.unitId} /></strong>
            </li>
          ))}</ul>
        </section>
      ))}
    </aside>
  );
}
