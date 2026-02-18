import { handleAuth } from "@workos-inc/authkit-nextjs";
import { MembershipRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const GET = handleAuth({
  returnPathname: "/",
  onSuccess: async ({ user, organizationId }) => {
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
    });

    if (!organizationId) {
      return;
    }

    const existingHousehold = await prisma.household.findUnique({
      where: { workosOrganizationId: organizationId },
      select: { id: true, ownerId: true },
    });

    const household =
      existingHousehold ??
      (await prisma.household.create({
        data: {
          name: "My Household",
          workosOrganizationId: organizationId,
          ownerId: dbUser.id,
        },
        select: { id: true, ownerId: true },
      }));

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
  },
});
