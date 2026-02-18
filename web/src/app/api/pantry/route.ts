import { NextResponse } from "next/server";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

type PantryPayload = {
  ingredientName?: unknown;
  quantity?: unknown;
  unit?: unknown;
  expiresAt?: unknown;
};

export async function GET() {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const items = await prisma.pantryItem.findMany({
    where: { householdId: membership.householdId },
    orderBy: [{ ingredientName: "asc" }, { unit: "asc" }],
  });

  return NextResponse.json({ data: items });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as PantryPayload;
  const ingredientName = typeof payload.ingredientName === "string" ? payload.ingredientName.trim() : "";
  const unit = typeof payload.unit === "string" ? payload.unit.trim() : "";
  const quantity = typeof payload.quantity === "number" || typeof payload.quantity === "string" ? Number(payload.quantity) : NaN;

  if (!ingredientName || !unit || !Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "ingredientName, unit, and quantity > 0 are required." }, { status: 400 });
  }

  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const expiresAt =
    typeof payload.expiresAt === "string" && payload.expiresAt.trim().length > 0
      ? new Date(payload.expiresAt)
      : null;

  const item = await prisma.pantryItem.upsert({
    where: {
      householdId_ingredientName_unit: {
        householdId: membership.householdId,
        ingredientName,
        unit,
      },
    },
    update: {
      quantity,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.valueOf()) ? expiresAt : null,
      userId,
    },
    create: {
      householdId: membership.householdId,
      userId,
      ingredientName,
      quantity,
      unit,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.valueOf()) ? expiresAt : null,
    },
  });

  return NextResponse.json({ data: item }, { status: 201 });
}
