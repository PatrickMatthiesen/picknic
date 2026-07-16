import { beforeEach, describe, expect, mock, test } from "bun:test";
import { MembershipRole } from "@prisma/client";

const withAuth = mock();
const userFindUnique = mock();
const userUpdate = mock();
const userUpsert = mock();
const householdUpsert = mock();
const householdMemberUpsert = mock();
const householdMemberFindFirst = mock();

const prisma = {
  user: { findUnique: userFindUnique, update: userUpdate, upsert: userUpsert },
  household: { upsert: householdUpsert },
  householdMember: {
    upsert: householdMemberUpsert,
    findFirst: householdMemberFindFirst,
  },
};

mock.module("@workos-inc/authkit-nextjs", () => ({ withAuth }));
mock.module("@/lib/prisma", () => ({ prisma }));

const { ensureLinkedProfile, requireAppAuthContext } = await import("@/lib/auth-context");

describe("WorkOS profile linking", () => {
  beforeEach(() => {
    withAuth.mockReset();
    userFindUnique.mockReset();
    userFindUnique.mockResolvedValue(null);
    userUpdate.mockReset();
    userUpsert.mockReset();
    householdUpsert.mockReset();
    householdMemberUpsert.mockReset();
    householdMemberFindFirst.mockReset();
  });

  test("requireAppAuthContext authenticates with WorkOS and returns the linked organization context", async () => {
    const sessionUser = {
      id: "user_workos",
      email: "pat@example.com",
      firstName: "Pat",
      lastName: "Example",
    };

    withAuth.mockResolvedValue({
      user: sessionUser,
      organizationId: "org_workos",
    });
    userUpsert.mockResolvedValue({ id: "user_database" });
    householdUpsert.mockResolvedValue({
      id: "household_database",
      ownerId: "user_database",
    });
    householdMemberUpsert.mockResolvedValue({});

    await expect(requireAppAuthContext()).resolves.toEqual({
      workosUserId: "user_workos",
      userId: "user_database",
      organizationId: "org_workos",
    });

    expect(withAuth).toHaveBeenCalledTimes(1);
    expect(withAuth).toHaveBeenCalledWith({ ensureSignedIn: true });
    expect(userUpsert).toHaveBeenCalledWith({
      where: { email: "pat@example.com" },
      update: {
        workosUserId: "user_workos",
        email: "pat@example.com",
        displayName: "Pat Example",
      },
      create: {
        workosUserId: "user_workos",
        email: "pat@example.com",
        displayName: "Pat Example",
      },
      select: { id: true },
    });
    expect(householdUpsert).toHaveBeenCalledWith({
      where: { workosOrganizationId: "org_workos" },
      update: {},
      create: {
        name: "My Household",
        workosOrganizationId: "org_workos",
        ownerId: "user_database",
      },
      select: { id: true, ownerId: true },
    });
  });

  test("adopts an existing email row when a development WorkOS environment changes", async () => {
    userUpsert.mockResolvedValue({ id: "existing_database_user" });
    householdUpsert.mockResolvedValue({ id: "existing_household" });
    householdMemberUpsert.mockResolvedValue({});

    await ensureLinkedProfile({
      id: "new_environment_user_id",
      email: "pat@example.com",
      firstName: "Pat",
      lastName: "Example",
    });

    expect(userUpsert).toHaveBeenCalledWith({
      where: { email: "pat@example.com" },
      update: {
        workosUserId: "new_environment_user_id",
        email: "pat@example.com",
        displayName: "Pat Example",
      },
      create: {
        workosUserId: "new_environment_user_id",
        email: "pat@example.com",
        displayName: "Pat Example",
      },
      select: { id: true },
    });
  });

  test("ensureLinkedProfile idempotently assigns the household owner role", async () => {
    const sessionUser = {
      id: "owner_workos",
      email: "owner@example.com",
      firstName: "Household",
      lastName: "Owner",
    };

    userUpsert.mockResolvedValue({ id: "owner_database" });
    householdUpsert.mockResolvedValue({
      id: "household_database",
      ownerId: "owner_database",
    });
    householdMemberUpsert.mockResolvedValue({});

    await ensureLinkedProfile(sessionUser, "org_workos");
    await ensureLinkedProfile(sessionUser, "org_workos");

    expect(userUpsert).toHaveBeenCalledTimes(2);
    expect(householdUpsert).toHaveBeenCalledTimes(2);
    expect(householdMemberUpsert).toHaveBeenCalledTimes(2);
    expect(householdMemberUpsert).toHaveBeenNthCalledWith(1, {
      where: {
        householdId_userId: {
          householdId: "household_database",
          userId: "owner_database",
        },
      },
      update: { role: MembershipRole.OWNER },
      create: {
        householdId: "household_database",
        userId: "owner_database",
        role: MembershipRole.OWNER,
      },
    });
    expect(householdMemberUpsert).toHaveBeenNthCalledWith(
      2,
      householdMemberUpsert.mock.calls[0][0],
    );
  });

  test("ensureLinkedProfile assigns member role when the household has another owner", async () => {
    userUpsert.mockResolvedValue({ id: "member_database" });
    householdUpsert.mockResolvedValue({
      id: "household_database",
      ownerId: "owner_database",
    });
    householdMemberUpsert.mockResolvedValue({});

    await ensureLinkedProfile(
      {
        id: "member_workos",
        email: "member@example.com",
        firstName: null,
        lastName: null,
      },
      "org_workos",
    );

    expect(householdMemberUpsert).toHaveBeenCalledWith({
      where: {
        householdId_userId: {
          householdId: "household_database",
          userId: "member_database",
        },
      },
      update: { role: MembershipRole.MEMBER },
      create: {
        householdId: "household_database",
        userId: "member_database",
        role: MembershipRole.MEMBER,
      },
    });
  });

  test("creates one personal household when WorkOS has no organization context", async () => {
    userUpsert.mockResolvedValue({ id: "personal_user" });
    householdUpsert.mockResolvedValue({ id: "personal_household" });
    householdMemberUpsert.mockResolvedValue({});

    const sessionUser = {
      id: "personal_workos",
      email: "personal@example.com",
      firstName: "Personal",
      lastName: "User",
    };

    await ensureLinkedProfile(sessionUser);
    await ensureLinkedProfile(sessionUser);

    expect(householdUpsert).toHaveBeenCalledTimes(2);
    expect(householdUpsert).toHaveBeenNthCalledWith(1, {
      where: { personalForUserId: "personal_user" },
      update: {},
      create: {
        name: "My Household",
        ownerId: "personal_user",
        personalForUserId: "personal_user",
      },
      select: { id: true },
    });
    expect(householdUpsert).toHaveBeenNthCalledWith(2, householdUpsert.mock.calls[0][0]);
    expect(householdMemberUpsert).toHaveBeenCalledTimes(2);
    expect(householdMemberUpsert).toHaveBeenNthCalledWith(1, {
      where: {
        householdId_userId: {
          householdId: "personal_household",
          userId: "personal_user",
        },
      },
      update: { role: MembershipRole.OWNER },
      create: {
        householdId: "personal_household",
        userId: "personal_user",
        role: MembershipRole.OWNER,
      },
    });
  });
});
