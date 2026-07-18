import { describe, expect, test } from "bun:test";
import { addUtcDays, formatDateInputValue, getDateKey, getWeekStartUtc, parseDateKey } from "@/lib/meal-plan";

describe("getWeekStartUtc", () => {
  test("returns monday for mid-week date", () => {
    const weekStart = getWeekStartUtc(new Date("2026-02-18T15:20:00.000Z"));
    expect(weekStart.toISOString()).toBe("2026-02-16T00:00:00.000Z");
  });

  test("returns monday for sunday date", () => {
    const weekStart = getWeekStartUtc(new Date("2026-02-22T10:00:00.000Z"));
    expect(weekStart.toISOString()).toBe("2026-02-16T00:00:00.000Z");
  });
});

describe("formatDateInputValue", () => {
  test("formats date as yyyy-mm-dd", () => {
    expect(formatDateInputValue(new Date("2026-02-18T10:00:00.000Z"))).toBe("2026-02-18");
  });
});

describe("date key helpers", () => {
  test("parses stable date keys and adds UTC days", () => {
    const date = parseDateKey("2026-07-18");
    expect(date?.toISOString()).toBe("2026-07-18T00:00:00.000Z");
    expect(getDateKey(addUtcDays(date!, 2))).toBe("2026-07-20");
  });

  test("rejects ambiguous date values", () => {
    expect(parseDateKey("07/18/2026")).toBeNull();
  });
});
