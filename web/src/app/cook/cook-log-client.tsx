"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getLocalDateKey } from "@/lib/meal-plan";
import { logCookedToday, swapCookedMeal } from "./cook-log-actions";
import { getCookLogOptions } from "./cook-log-options";

type CookLogOptions = Awaited<ReturnType<typeof getCookLogOptions>>;
type SwapOption = CookLogOptions["options"][number];
type CookLogState = CookLogOptions & {
  dateKey: string;
  status: "loading" | "ready" | "load-error" | "logging" | "swapping" | "swapped";
  error?: string;
  notice?: string;
};

async function readCookLog(recipeId: string, dateKey: string, logged = false): Promise<CookLogState> {
  try {
    const result = await getCookLogOptions({ recipeId, dateKey });
    return { ...result, dateKey, status: "ready" };
  } catch {
    return {
      dateKey,
      logged,
      options: [],
      status: "load-error",
      error: logged ? "Could not load meal plan options." : "Could not check today's cooking log.",
    };
  }
}

export function CookLogClient({ recipeId, recipeRevisionId }: { recipeId: string; recipeRevisionId: string }) {
  const [state, setState] = useState<CookLogState | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    void readCookLog(recipeId, getLocalDateKey()).then((result) => {
      if (active) setState(result);
    });
    return () => { active = false; };
  }, [recipeId]);

  async function run(action: "refresh" | "log" | SwapOption) {
    if (!state || busy.current) return;
    busy.current = true;
    const dateKey = getLocalDateKey();
    const dateChanged = dateKey !== state.dateKey;

    try {
      if (action === "refresh" || dateChanged) {
        const logged = !dateChanged && state.logged;
        setState({ dateKey, logged, options: [], status: "loading" });
        const result = await readCookLog(recipeId, dateKey, logged);
        setState({ ...result, notice: dateChanged ? "The date changed. Review today's cooking log." : undefined });
      } else if (action === "log") {
        setState({ ...state, status: "logging", error: undefined, notice: undefined });
        try {
          await logCookedToday({ recipeId, recipeRevisionId, dateKey });
        } catch {
          setState({ ...state, error: "Could not log this recipe as cooked. Try again." });
          return;
        }
        setState({ dateKey, logged: true, options: [], status: "loading" });
        setState(await readCookLog(recipeId, dateKey, true));
      } else {
        const { plannedEntryId, todayEntryId, plannedDateKey } = action;
        setState({ ...state, status: "swapping", error: undefined, notice: undefined });
        try {
          await swapCookedMeal({ recipeId, recipeRevisionId, dateKey, plannedEntryId, todayEntryId, plannedDateKey });
          setState({ dateKey, logged: true, options: [], status: "swapped" });
        } catch {
          const result = await readCookLog(recipeId, dateKey, true);
          setState({ ...result, error: "Could not update the meal plan." });
        }
      }
    } finally {
      busy.current = false;
    }
  }

  const status = state?.status ?? "loading";
  const logged = state?.logged ?? false;

  return (
    <div className="cooking-log">
      <div className="cooking-log-status" role="status">
        {logged && <p>Logged as cooked today.</p>}
        {status === "loading" && <p>{logged ? "Checking the meal plan…" : "Checking today's cooking log…"}</p>}
        {status === "swapping" && <p>Updating the meal plan…</p>}
        {status === "swapped" && <p>Meal plan updated.</p>}
        {state?.notice && <p>{state.notice}</p>}
      </div>
      {state?.error && <p className="cooking-log-error" role="alert">{state.error}</p>}
      {(status === "ready" || status === "logging") && !logged && (
        <button className="app-theme-primary-button" disabled={status === "logging"} onClick={() => void run("log")} type="button">
          <Check aria-hidden="true" size={19} /> {status === "logging" ? "Logging as cooked…" : "Log as cooked today"}
        </button>
      )}
      {status === "load-error" && (
        <button className="app-theme-secondary-button" onClick={() => void run("refresh")} type="button">Try again</button>
      )}
      {(status === "ready" || status === "swapping") && logged && !!state?.options.length && (
        <div className="cooking-log-options" role="group" aria-label="Optional meal plan changes">
          {state.options.map((option) => (
            <button className="app-theme-secondary-button" disabled={status === "swapping"} key={`${option.plannedEntryId}:${option.todayEntryId}`} onClick={() => void run(option)} type="button">
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
