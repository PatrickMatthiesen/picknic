import { MembershipRole, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { getUnitStorageKey, normalizeUnitInput } from "@/lib/units";

type RouteContext = { params: Promise<{ pantryItemId: string }> };
type PantryUpdatePayload = {
  quantity?: unknown;
  unit?: unknown;
  unitId?: unknown;
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
    select: { id: true, unitId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Pantry item not found." }, { status: 404 });
  }

  const quantity =
    typeof payload.quantity === "number" || typeof payload.quantity === "string" ? Number(payload.quantity) : undefined;
  const unit = typeof payload.unit === "string" ? payload.unit.trim() : undefined;
  if (payload.unit !== undefined && !unit) {
    return NextResponse.json({ error: "unit must be a non-empty string." }, { status: 400 });
  }
  const normalizedUnit = unit
    ? normalizeUnitInput(unit, "metric", typeof payload.unitId === "string" ? payload.unitId : existing.unitId)
    : undefined;
  const expiresAt =
    typeof payload.expiresAt === "string" && payload.expiresAt.trim().length > 0 ? new Date(payload.expiresAt) : undefined;

  try {
    const updated = await prisma.pantryItem.update({
      where: { id: pantryItemId },
      data: {
        quantity: quantity !== undefined && Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
        ...(normalizedUnit && normalizedUnit.unit ? {
          unit: normalizedUnit.unit,
          unitId: normalizedUnit.unitId,
          unitKey: getUnitStorageKey(normalizedUnit.unit, normalizedUnit.unitId),
        } : {}),
        expiresAt: expiresAt && !Number.isNaN(expiresAt.valueOf()) ? expiresAt : payload.expiresAt === null ? null : undefined,
        userId,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A pantry item with this ingredient and unit already exists." }, { status: 409 });
    }
    throw error;
  }
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
