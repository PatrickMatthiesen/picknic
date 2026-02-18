import { MembershipRole } from "@prisma/client";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { prisma } from "@/lib/prisma";

export type AppAuthContext = {
  workosUserId: string;
  userId: string;
  organizationId?: string;
};

export async function requireAppAuthContext(): Promise<AppAuthContext> {
  const { user, organizationId } = await withAuth({ ensureSignedIn: true });
  const dbUser = await prisma.user.findUnique({
    where: { workosUserId: user.id },
    select: { id: true },
  });

  if (!dbUser) {
    throw new Error("Authenticated user does not have a linked profile.");
  }

  return {
    workosUserId: user.id,
    userId: dbUser.id,
    organizationId,
  };
}

export async function resolveActiveHouseholdId(userId: string, organizationId?: string): Promise<string | null> {
  if (organizationId) {
    const membership = await prisma.householdMember.findFirst({
      where: {
        userId,
        household: { workosOrganizationId: organizationId },
      },
      select: { householdId: true },
    });

    if (membership) {
      return membership.householdId;
    }
  }

  const fallbackMembership = await prisma.householdMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { householdId: true },
  });

  return fallbackMembership?.householdId ?? null;
}

export async function resolveActiveMembership(
  userId: string,
  organizationId?: string,
): Promise<{ householdId: string; role: MembershipRole } | null> {
  if (organizationId) {
    const membership = await prisma.householdMember.findFirst({
      where: {
        userId,
        household: { workosOrganizationId: organizationId },
      },
      select: { householdId: true, role: true },
    });

    if (membership) {
      return membership;
    }
  }

  const fallbackMembership = await prisma.householdMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { householdId: true, role: true },
  });

  return fallbackMembership;
}
