import { MembershipRole } from "@prisma/client";
import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs";
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
  const linkedUser = await prisma.user.findUnique({
    where: { workosUserId: user.id },
    select: { id: true },
  });
  const profile = {
    workosUserId: user.id,
    email: user.email,
    displayName,
  };
  const dbUser = linkedUser
    ? await prisma.user.update({
        where: { id: linkedUser.id },
        data: profile,
        select: { id: true },
      })
    : await prisma.user.upsert({
        where: { email: user.email },
        update: profile,
        create: profile,
        select: { id: true },
      });

  if (!organizationId) {
    const household = await prisma.household.upsert({
      where: { personalForUserId: dbUser.id },
      update: {},
      create: {
        name: "My Household",
        ownerId: dbUser.id,
        personalForUserId: dbUser.id,
      },
      select: { id: true },
    });

    await prisma.householdMember.upsert({
      where: {
        householdId_userId: {
          householdId: household.id,
          userId: dbUser.id,
        },
      },
      update: { role: MembershipRole.OWNER },
      create: {
        householdId: household.id,
        userId: dbUser.id,
        role: MembershipRole.OWNER,
      },
    });

    return dbUser;
  }

  // Session organization claims can outlive a membership removal. Check the
  // provider on every organization request, including when a local row exists,
  // so an in-flight profile upsert cannot permanently recreate removed access.
  const memberships = await getWorkOS().userManagement.listOrganizationMemberships({
    organizationId, userId: user.id, statuses: ["active"], limit: 1,
  });
  if (!memberships.data.some(member => member.organizationId === organizationId && member.userId === user.id && member.status === "active")) {
    await prisma.householdMember.deleteMany({
      where: { userId: dbUser.id, household: { workosOrganizationId: organizationId } },
    });
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

    return membership?.householdId ?? null;
  }

  const fallbackMembership = await prisma.householdMember.findFirst({
    where: { userId, household: { personalForUserId: userId } },
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

    return membership ?? null;
  }

  const fallbackMembership = await prisma.householdMember.findFirst({
    where: { userId, household: { personalForUserId: userId } },
    orderBy: { createdAt: "asc" },
    select: { householdId: true, role: true },
  });

  return fallbackMembership;
}
