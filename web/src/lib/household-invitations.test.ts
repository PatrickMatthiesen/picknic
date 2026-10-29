import { expect, test } from "bun:test";
import { invitationRetryAfter } from "./household-invitations";

test("invitation limits enforce cooldown and rolling hourly and daily budgets", () => {
  const now = new Date("2030-01-02T12:00:00Z");
  const ago = (minutes: number) => ({ createdAt: new Date(now.getTime() - minutes * 60_000) });
  expect(invitationRetryAfter([], now)).toBe(0);
  expect(invitationRetryAfter([ago(0.5)], now)).toBe(30);
  expect(invitationRetryAfter([ago(1)], now)).toBe(0);
  expect(invitationRetryAfter([ago(2), ago(3), ago(4), ago(5), ago(6)], now)).toBe(54 * 60);
  expect(invitationRetryAfter(Array.from({ length: 20 }, (_, i) => ago(60 + i)), now)).toBe((24 * 60 - 79) * 60);
  expect(invitationRetryAfter([ago(24 * 60 + 1)], now)).toBe(0);
});
