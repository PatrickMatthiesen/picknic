import { MembershipRole } from "@prisma/client";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { prisma } from "@/lib/prisma";

export type AppAuthContext = {
  workosUserId: string;
  userId: string;
  organizationId?: string;
};

type SessionUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

export async function ensureLinkedProfile(
  user: SessionUser,
  organizationId?: string,
): Promise<{ id: string }> {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  const dbUser = await prisma.user.upsert({
    where: { workosUserId: user.id },
    update: {
      email: user.email,
      displayName,
    },
    create: {
      workosUserId: user.id,
      email: user.email,
      displayName,
    },
    select: { id: true },
  });

  if (!organizationId) {
    return dbUser;
  }

  const household = await prisma.household.upsert({
    where: { workosOrganizationId: organizationId },
    update: {},
    create: {
      name: "My Household",
      workosOrganizationId: organizationId,
      ownerId: dbUser.id,
    },
    select: { id: true, ownerId: true },
  });

  await prisma.householdMember.upsert({
    where: {
      householdId_userId: {
        householdId: household.id,
        userId: dbUser.id,
      },
    },
    update: {
      role: household.ownerId === dbUser.id ? MembershipRole.OWNER : MembershipRole.MEMBER,
    },
    create: {
      householdId: household.id,
      userId: dbUser.id,
      role: household.ownerId === dbUser.id ? MembershipRole.OWNER : MembershipRole.MEMBER,
    },
  });

  return dbUser;
}

export async function requireAppAuthContext(): Promise<AppAuthContext> {
  const { user, organizationId } = await withAuth({ ensureSignedIn: true });
  const dbUser = await ensureLinkedProfile(user, organizationId);

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
