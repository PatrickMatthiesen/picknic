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
