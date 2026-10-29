import { MembershipRole } from "@prisma/client";

export function householdManagementError(input: { role: MembershipRole; activeOrganizationId?: string; householdOrganizationId: string | null }): { status: 403 | 409; error: string } | null {
  if (input.role !== MembershipRole.OWNER) return { status: 403, error: "Only household owners can manage members." };
  if (!input.householdOrganizationId || input.householdOrganizationId !== input.activeOrganizationId) return { status: 409, error: "Invitations require the active WorkOS organization." };
  return null;
}

export function canEnableHouseholdSharing(input: {
  role: MembershipRole;
  householdOwnerId: string;
  userId: string;
  personalForUserId: string | null;
  activeOrganizationId?: string;
  householdOrganizationId: string | null;
}): { status: 403 | 409; error: string } | null {
  if (input.role !== MembershipRole.OWNER || input.householdOwnerId !== input.userId || input.personalForUserId !== input.userId) {
    return { status: 403, error: "Only the household owner can enable sharing." };
  }
  if (input.activeOrganizationId && input.householdOrganizationId !== input.activeOrganizationId) {
    return { status: 409, error: "Switch to this household before enabling sharing." };
  }
  return null;
}

export function canRemoveOrganizationMember(input: { memberOrganizationId: string; activeOrganizationId: string; memberUserId: string; currentUserId: string; householdOwnerUserId: string; roleSlug: string }): boolean {
  return input.memberOrganizationId === input.activeOrganizationId
    && input.memberUserId !== input.currentUserId
    && input.memberUserId !== input.householdOwnerUserId
    && input.roleSlug !== "owner" && input.roleSlug !== "admin";
}
