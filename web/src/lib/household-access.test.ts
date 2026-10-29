import { describe, expect, test } from "bun:test";
import { MembershipRole } from "@prisma/client";
import { canEnableHouseholdSharing, canRemoveOrganizationMember, householdManagementError } from "./household-access";

describe("household member authority", () => {
  test("requires owner role and exact active WorkOS organization scope", () => {
    expect(householdManagementError({ role: MembershipRole.OWNER, activeOrganizationId: "org-a", householdOrganizationId: "org-a" })).toBeNull();
    expect(householdManagementError({ role: MembershipRole.MEMBER, activeOrganizationId: "org-a", householdOrganizationId: "org-a" })?.status).toBe(403);
    expect(householdManagementError({ role: MembershipRole.OWNER, activeOrganizationId: "org-b", householdOrganizationId: "org-a" })?.status).toBe(409);
    expect(householdManagementError({ role: MembershipRole.OWNER, activeOrganizationId: undefined, householdOrganizationId: null })?.status).toBe(409);
  });
  test("only removes ordinary memberships in the active organization", () => {
    const base = { memberOrganizationId: "org-a", activeOrganizationId: "org-a", memberUserId: "user-b", currentUserId: "user-a", householdOwnerUserId: "user-a", roleSlug: "member" };
    expect(canRemoveOrganizationMember(base)).toBe(true);
    expect(canRemoveOrganizationMember({ ...base, memberOrganizationId: "org-b" })).toBe(false);
    expect(canRemoveOrganizationMember({ ...base, memberUserId: "user-a" })).toBe(false);
    expect(canRemoveOrganizationMember({ ...base, roleSlug: "owner" })).toBe(false);
    expect(canRemoveOrganizationMember({ ...base, roleSlug: "admin" })).toBe(false);
  });
  test("lets the owner resume sharing while the AuthKit session has no organization", () => {
    const personal = { role: MembershipRole.OWNER, householdOwnerId: "user-a", userId: "user-a", personalForUserId: "user-a", householdOrganizationId: "org-new" };
    expect(canEnableHouseholdSharing(personal)).toBeNull();
    expect(canEnableHouseholdSharing({ ...personal, activeOrganizationId: "org-new" })).toBeNull();
    expect(canEnableHouseholdSharing({ ...personal, role: MembershipRole.MEMBER })?.status).toBe(403);
    expect(canEnableHouseholdSharing({ ...personal, personalForUserId: null })?.status).toBe(403);
    expect(canEnableHouseholdSharing({ ...personal, activeOrganizationId: "org-other" })?.status).toBe(409);
  });
});
