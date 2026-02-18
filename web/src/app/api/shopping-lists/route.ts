import { NextResponse } from "next/server";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { getWeekStartUtc } from "@/lib/meal-plan";
import { generateShoppingListForWeek, getShoppingListForWeek } from "@/lib/shopping-list-service";

function resolveWeekStart(request: Request): Date {
  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");

  if (!weekStartParam) {
    return getWeekStartUtc(new Date());
  }

  const parsed = new Date(weekStartParam);
  return Number.isNaN(parsed.valueOf()) ? getWeekStartUtc(new Date()) : getWeekStartUtc(parsed);
}

export async function GET(request: Request) {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const weekStart = resolveWeekStart(request);
  const shoppingList = await getShoppingListForWeek(membership.householdId, weekStart);

  return NextResponse.json({ data: shoppingList });
}

export async function POST(request: Request) {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const weekStart = resolveWeekStart(request);
  try {
    const refreshedList = await generateShoppingListForWeek({ householdId: membership.householdId, userId, weekStart });
    return NextResponse.json({ data: refreshedList }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("No meal plan found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    throw error;
  }
}
