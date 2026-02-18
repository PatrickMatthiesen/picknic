import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ pantryItemId: string }> };
type PantryUpdatePayload = {
  quantity?: unknown;
  unit?: unknown;
  expiresAt?: unknown;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { pantryItemId } = await context.params;
  const payload = (await request.json()) as PantryUpdatePayload;

  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const existing = await prisma.pantryItem.findFirst({
    where: { id: pantryItemId, householdId: membership.householdId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Pantry item not found." }, { status: 404 });
  }

  const quantity =
    typeof payload.quantity === "number" || typeof payload.quantity === "string" ? Number(payload.quantity) : undefined;
  const unit = typeof payload.unit === "string" ? payload.unit.trim() : undefined;
  const expiresAt =
    typeof payload.expiresAt === "string" && payload.expiresAt.trim().length > 0 ? new Date(payload.expiresAt) : undefined;

  const updated = await prisma.pantryItem.update({
    where: { id: pantryItemId },
    data: {
      quantity: quantity !== undefined && Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
      unit: unit && unit.length > 0 ? unit : undefined,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.valueOf()) ? expiresAt : payload.expiresAt === null ? null : undefined,
      userId,
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { pantryItemId } = await context.params;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }
  if (membership.role !== MembershipRole.OWNER) {
    return NextResponse.json({ error: "Only household owners can delete pantry items." }, { status: 403 });
  }

  const existing = await prisma.pantryItem.findFirst({
    where: { id: pantryItemId, householdId: membership.householdId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Pantry item not found." }, { status: 404 });
  }

  await prisma.pantryItem.delete({ where: { id: pantryItemId } });
  return new NextResponse(null, { status: 204 });
}
