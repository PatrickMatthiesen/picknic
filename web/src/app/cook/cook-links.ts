import { getDateKey, getWeekStartUtc, parseDateKey } from "@/lib/meal-plan";

export function cookPlannerHref(dateKey: string): string {
  const date = parseDateKey(dateKey);
  if (!date) return "/planner";
  const week = getDateKey(getWeekStartUtc(date));
  return `/planner?week=${week}&day=${dateKey}`;
}
