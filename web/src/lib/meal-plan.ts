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
