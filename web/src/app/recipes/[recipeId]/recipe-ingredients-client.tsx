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

export function RecipeIngredientsClient({ groups, addSelected }: { groups: IngredientGroup[]; addSelected: (data: FormData) => void | Promise<void> }) {
  const [preference, setPreference] = useMeasurementPreference();

  return (
    <aside>
      <header className="recipe-ingredient-heading">
        <h2>Ingredients</h2>
        <MeasurementPreferenceSelect onChange={setPreference} value={preference} />
      </header>
      <form action={addSelected}>
      {groups.map((group) => (
        <section key={group.key}>
          {groups.length > 1 ? <h3>{group.component}</h3> : null}
          <ul>{group.ingredients.map((ingredient) => (
            <li key={ingredient.id}>
              <label className="flex items-start gap-2"><input aria-label={`Add ${ingredient.name} to shopping list`} name="ingredientId" type="checkbox" value={ingredient.id} /><span>{ingredient.name}{ingredient.notes ? <small>{ingredient.notes}</small> : null}</span></label>
              <input aria-label={`${ingredient.name} quantity to add`} className="app-theme-input w-24 rounded-lg px-2 py-2 text-sm" min="0" name={`quantity-${ingredient.id}`} step="0.01" type="number" defaultValue={ingredient.quantity ?? ""} />
              <strong><IngredientMeasurement preference={preference} quantity={ingredient.quantity} unit={ingredient.unit} unitId={ingredient.unitId} /></strong>
            </li>
          ))}</ul>
        </section>
      ))}
      <button className="app-theme-secondary-button mt-3 rounded-lg px-4 py-2 text-sm" type="submit">Add selected to shopping</button>
      </form>
    </aside>
  );
}
