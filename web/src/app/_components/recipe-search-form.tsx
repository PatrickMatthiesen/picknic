"use client";

import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { useId, type ReactNode } from "react";

type RecipeSearchFormProps = {
  action?: string;
  children: ReactNode;
  query: string;
  maxMinutes?: string | number;
  diet?: string;
  exclude?: string;
  presetTimes?: boolean;
};

const timeOptions = ["15", "30", "60"];
const dietOptions = ["vegetarian", "vegan", "gluten-free"];

export function RecipeSearchForm(props: RecipeSearchFormProps) {
  return <RecipeSearchToolbar key={JSON.stringify([props.query, props.maxMinutes, props.diet, props.exclude])} {...props} />;
}

function RecipeSearchToolbar({ action, children, query, maxMinutes, diet, exclude, presetTimes }: RecipeSearchFormProps) {
  const titleId = useId();
  const appliedTime = String(maxMinutes ?? "");
  const customTimeApplied = appliedTime !== "" && !timeOptions.includes(appliedTime);
  const timeChoice = customTimeApplied ? "custom" : appliedTime;
  const allowCustomTime = !presetTimes || customTimeApplied;
  const appliedTag = diet?.toLowerCase() ?? "";
  const dietChoice = dietOptions.includes(appliedTag) ? appliedTag : appliedTag ? "custom" : "";
  const active = [appliedTime && `≤ ${appliedTime} min`, diet, exclude && `Without ${exclude}`].filter(Boolean);

  return (
    <form action={action} className="recipe-query" method="get" noValidate role="search">
      {children}
      <div className="recipe-query-toolbar">
        <div className="recipe-query-input">
          <Search aria-hidden="true" size={19} />
          <input aria-label="Search by title, ingredient or tag" defaultValue={query} name="q" placeholder="Search recipes" type="search" />
          <button aria-label="Search recipes" title="Search recipes" type="submit"><ArrowRight aria-hidden="true" size={18} /></button>
        </div>
        <details className="recipe-filter-disclosure" onKeyDown={(event) => {
          if (event.key === "Escape" && event.currentTarget.open) {
            event.preventDefault();
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}>
          <summary className="recipe-filter-trigger">
            <SlidersHorizontal aria-hidden="true" size={17} /> Filters
            {active.length > 0 && <span aria-label={`${active.length} active`}>{active.length}</span>}
          </summary>
          <section aria-labelledby={titleId} className="recipe-filter-panel">
            <h2 id={titleId}>Recipe filters</h2>
            <div className="recipe-filter-form">
              <fieldset>
                <legend>Cooking time</legend>
                <div className="recipe-filter-options">
                  {["", ...timeOptions, ...(allowCustomTime ? ["custom"] : [])].map((value) => (
                    <label key={value}>
                      <input className="sr-only" defaultChecked={timeChoice === value} name="timeChoice" type="radio" value={value} />
                      <span>{value === "custom" ? "Custom" : value ? `${value} min or less` : "Any time"}</span>
                    </label>
                  ))}
                </div>
                {allowCustomTime && (
                  <label className="recipe-filter-field recipe-filter-custom">Limit in minutes<input className="app-theme-input" defaultValue={timeChoice === "custom" ? appliedTime : ""} min={1} name="maxMinutes" type="number" /></label>
                )}
              </fieldset>
              <fieldset>
                <legend>Dietary tag</legend>
                <div className="recipe-filter-options">
                  {["", ...dietOptions, "custom"].map((value) => (
                    <label key={value}>
                      <input className="sr-only" defaultChecked={dietChoice === value} name="dietChoice" type="radio" value={value} />
                      <span>{value === "custom" ? "Other tag" : value || "Any tag"}</span>
                    </label>
                  ))}
                </div>
                <label className="recipe-filter-field recipe-filter-custom">Custom dietary tag<input className="app-theme-input" defaultValue={dietChoice === "custom" ? diet : ""} name="diet" placeholder="e.g. dairy-free" /></label>
              </fieldset>
              <label className="recipe-filter-field">Exclude ingredients<input className="app-theme-input" defaultValue={exclude} name="exclude" placeholder="e.g. peanuts, shellfish" /></label>
              <p className="app-theme-muted text-xs">Filters use recipe tags and ingredient names. Check ingredients and packaging for allergies.</p>
              <footer>
                <button className="recipe-filter-reset" name="filterAction" type="submit" value="clear">Clear all</button>
                <button className="app-theme-primary-button" type="submit">Apply filters</button>
              </footer>
            </div>
          </section>
        </details>
      </div>
      {active.length > 0 && (
        <div className="recipe-query-applied">
          <ul aria-label="Applied filters" className="recipe-query-active">
            {active.map((filter, index) => <li key={index}>{filter}</li>)}
          </ul>
          <button className="recipe-filter-reset" name="filterAction" type="submit" value="clear">Clear filters</button>
        </div>
      )}

    </form>
  );
}
