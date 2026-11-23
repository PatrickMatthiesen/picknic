export function toUtcDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

export function getWeekStartUtc(date: Date): Date {
  const normalized = toUtcDate(date);
  const day = normalized.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + diff);
  return normalized;
}

export function formatDateInputValue(date: Date): string {
  return toUtcDate(date).toISOString().slice(0, 10);
}

export function parseDateKey(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function addUtcDays(date: Date, days: number): Date {
  const next = toUtcDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getDateKey(date: Date): string {
  return toUtcDate(date).toISOString().slice(0, 10);
}

export function getLocalDateKey() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

export function parseTodayDateKey(value: string, now = Date.now()): Date | null {
  const date = parseDateKey(value);
  if (!date || getDateKey(date) !== value) return null;

  // The browser sends its local calendar date. UTC-12 and UTC+14 bound it.
  const hour = 60 * 60 * 1000;
  const earliest = toUtcDate(new Date(now - 12 * hour));
  const latest = toUtcDate(new Date(now + 14 * hour));
  return date >= earliest && date <= latest ? date : null;
}

export const MAX_PLANNED_SERVINGS = 100;

export function parsePlannedServings(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const servings = Number(value);
  return Number.isInteger(servings) && servings >= 1 && servings <= MAX_PLANNED_SERVINGS ? servings : null;
}
