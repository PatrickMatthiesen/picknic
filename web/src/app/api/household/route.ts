import { NextResponse } from "next/server";
import { WorkOS } from "@workos-inc/node";
import { refreshSession } from "@workos-inc/authkit-nextjs";
import { MembershipRole } from "@prisma/client";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { reserveHouseholdInvitation } from "@/lib/household-invitations";
import { canEnableHouseholdSharing, canRemoveOrganizationMember, householdManagementError } from "@/lib/household-access";

function workosClient() {
  const key = process.env.WORKOS_API_KEY;
  if (!key) return null;
  return new WorkOS(key);
}
async function context() {
  const auth = await requireAppAuthContext();
  const membership = await resolveActiveMembership(auth.userId, auth.organizationId);
  if (!membership) return { error: NextResponse.json({ error: "No household is connected to this account." }, { status: 403 }) };
  const household = await prisma.household.findUnique({ where: { id: membership.householdId }, select: { id: true, name: true, ownerId: true, owner: { select: { workosUserId: true } }, workosOrganizationId: true, members: { include: { user: { select: { email: true, displayName: true, workosUserId: true } } } } } });
  if (!household) return { error: NextResponse.json({ error: "Household not found." }, { status: 404 }) };
  const accessError = householdManagementError({ role: membership.role, activeOrganizationId: auth.organizationId, householdOrganizationId: household.workosOrganizationId });
  if (accessError) return { error: NextResponse.json({ error: accessError.error }, { status: accessError.status }) };
  return { auth, household };
}
export async function GET() {
  const result = await context();
  if ("error" in result) return result.error;
  const workos = workosClient();
  if (!workos) return NextResponse.json({ error: "Household invitations need WORKOS_API_KEY on the server." }, { status: 503 });
  try {
    const [members, invitations] = await Promise.all([
      workos.userManagement.listOrganizationMemberships({ organizationId: result.household.workosOrganizationId!, statuses: ["active"], limit: 100 }),
      workos.userManagement.listInvitations({ organizationId: result.household.workosOrganizationId!, limit: 100 }),
    ]);
    return NextResponse.json({ household: { name: result.household.name }, members: members.data.map((m) => ({ id: m.id, userId: m.userId, role: m.role.slug, status: m.status, local: result.household.members.some((x) => x.user.workosUserId === m.userId), email: result.household.members.find((x) => x.user.workosUserId === m.userId)?.user.email ?? m.userId })), invitations: invitations.data.filter((i) => i.state === "pending").map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt })) });
  } catch (error) {
    console.error("Household members could not be loaded from WorkOS.", error);
    return NextResponse.json({ error: "WorkOS could not load this organization's members." }, { status: 502 });
  }
}
export async function POST(request: Request) {
  const payload = await request.json() as { email?: unknown; enableSharing?: unknown };
  if (payload.enableSharing === true) return enableHouseholdSharing();
  const result = await context();
  if ("error" in result) return result.error;
  const workos = workosClient();
  if (!workos) return NextResponse.json({ error: "Household invitations need WORKOS_API_KEY on the server." }, { status: 503 });
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (result.household.members.some((member) => member.user.email.toLowerCase() === email)) return NextResponse.json({ error: "That person is already in this household." }, { status: 409 });
  let attemptId: string | undefined;
  try {
    const reservation = await reserveHouseholdInvitation(result.household.id, result.auth.userId);
    if (!reservation.allowed) return NextResponse.json({ error: "Invitation limit reached. Wait before sending another invitation." }, { status: 429, headers: { "Retry-After": String(reservation.retryAfter) } });
    attemptId = reservation.attemptId;
    const invitations = await workos.userManagement.listInvitations({ organizationId: result.household.workosOrganizationId!, email, limit: 100 });
    if (invitations.data.some(invitation => invitation.state === "pending" && invitation.email.toLowerCase() === email)) {
      await prisma.householdInvitationAttempt.update({ where: { id: attemptId }, data: { status: "DUPLICATE" } });
      return NextResponse.json({ error: "That person already has a pending invitation." }, { status: 409 });
    }
    const invitation = await workos.userManagement.sendInvitation({ email, organizationId: result.household.workosOrganizationId!, inviterUserId: result.auth.workosUserId, expiresInDays: 7 });
    await prisma.householdInvitationAttempt.update({ where: { id: attemptId }, data: { status: "SENT", workosInvitationId: invitation.id } });
    return NextResponse.json({ invitation: { id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt } }, { status: 201 });
  } catch (error) {
    if (attemptId) await prisma.householdInvitationAttempt.update({ where: { id: attemptId }, data: { status: "FAILED" } }).catch(() => {});
    console.error("WorkOS household invitation failed.", error);
    return NextResponse.json({ error: "WorkOS could not send that invitation." }, { status: 502 });
  }
}

async function enableHouseholdSharing() {
  const auth = await requireAppAuthContext();
  const household = await prisma.household.findUnique({
    where: { personalForUserId: auth.userId },
    include: { owner: { select: { workosUserId: true } } },
  });
  if (!household) return NextResponse.json({ error: "Personal household not found." }, { status: 404 });
  const membership = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId: household.id, userId: auth.userId } }, select: { role: true } });
  const accessError = canEnableHouseholdSharing({ role: membership?.role ?? MembershipRole.MEMBER, householdOwnerId: household.ownerId, userId: auth.userId, personalForUserId: household.personalForUserId, activeOrganizationId: auth.organizationId, householdOrganizationId: household.workosOrganizationId });
  if (accessError) return NextResponse.json({ error: accessError.error }, { status: accessError.status });
  if (auth.organizationId && household.workosOrganizationId === auth.organizationId) return NextResponse.json({ ok: true, organizationId: auth.organizationId });
  if (auth.organizationId && household.workosOrganizationId && household.workosOrganizationId !== auth.organizationId) return NextResponse.json({ error: "This household is already linked to another organization. Contact support before changing it." }, { status: 409 });
  const workos = workosClient();
  if (!workos) return NextResponse.json({ error: "Sharing needs WORKOS_API_KEY on the server." }, { status: 503 });

  let organizationId: string;
  try {
    let organization;
    try {
      organization = await workos.organizations.getOrganizationByExternalId(household.id);
    } catch (error) {
      if (!(error instanceof Error) || !("status" in error) || error.status !== 404) throw error;
      organization = await workos.organizations.createOrganization(
        { name: household.name, externalId: household.id },
        { idempotencyKey: `picknic-household-${household.id}` },
      );
    }
    organizationId = organization.id;
    const existing = await workos.userManagement.listOrganizationMemberships({ organizationId: organization.id, limit: 100 });
    const ownerMembership = existing.data.find((membership) => membership.userId === auth.workosUserId && membership.status === "active");
    if (ownerMembership) {
      if (ownerMembership.role.slug !== "admin") await workos.userManagement.updateOrganizationMembership(ownerMembership.id, { roleSlug: "admin" });
    } else {
      await workos.userManagement.createOrganizationMembership({ organizationId: organization.id, userId: auth.workosUserId, roleSlug: "admin" });
    }
    await prisma.$transaction(async (tx) => {
      await tx.household.update({ where: { id: household.id }, data: { workosOrganizationId: organization.id } });
      await tx.householdMember.upsert({
        where: { householdId_userId: { householdId: household.id, userId: auth.userId } },
        update: { role: MembershipRole.OWNER },
        create: { householdId: household.id, userId: auth.userId, role: MembershipRole.OWNER },
      });
    });
  } catch (error) {
    console.error("Household sharing could not be enabled.", error);
    return NextResponse.json({ error: "Sharing could not be enabled. Your household data is still intact. Try again to resume setup." }, { status: 502 });
  }
  // Keep this outside the provisioning catch. AuthKit may redirect through Next.js
  // when the organization requires an authentication step; that redirect must pass through.
  await refreshSession({ organizationId, ensureSignedIn: true });
  return NextResponse.json({ ok: true, organizationId });
}
export async function DELETE(request: Request) {
  const result = await context();
  if ("error" in result) return result.error;
  const workos = workosClient();
  if (!workos) return NextResponse.json({ error: "Household member management needs WORKOS_API_KEY on the server." }, { status: 503 });
  const { searchParams } = new URL(request.url);
  const invitationId = searchParams.get("invitationId");
  const membershipId = searchParams.get("membershipId");
  try {
    if (invitationId) {
      const invitation = await workos.userManagement.getInvitation(invitationId);
      if (invitation.organizationId !== result.household.workosOrganizationId || invitation.state !== "pending") return NextResponse.json({ error: "Pending invitation not found in this household." }, { status: 404 });
      await workos.userManagement.revokeInvitation(invitationId);
    } else if (membershipId) {
      const { data } = await workos.userManagement.listOrganizationMemberships({ organizationId: result.household.workosOrganizationId!, limit: 100 });
      const target = data.find((member) => member.id === membershipId && member.organizationId === result.household.workosOrganizationId);
      if (!target) return NextResponse.json({ error: "Member not found in this household." }, { status: 404 });
      if (!canRemoveOrganizationMember({ memberOrganizationId: target.organizationId, activeOrganizationId: result.household.workosOrganizationId!, memberUserId: target.userId, currentUserId: result.auth.workosUserId, householdOwnerUserId: result.household.owner.workosUserId, roleSlug: target.role.slug })) return NextResponse.json({ error: "Owner, admin, or current user memberships cannot be removed here." }, { status: 400 });
      await workos.userManagement.deleteOrganizationMembership(membershipId);
      await prisma.householdMember.deleteMany({ where: { householdId: result.household.id, user: { workosUserId: target.userId } } });
    } else return NextResponse.json({ error: "Provide an invitation or membership ID." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("WorkOS household member action failed.", error);
    return NextResponse.json({ error: "WorkOS could not complete that member action." }, { status: 502 });
  }
}
