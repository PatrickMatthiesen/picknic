import { prisma } from "./prisma";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function invitationRetryAfter(attempts: { createdAt: Date }[], now: Date): number {
  const times = attempts.map(attempt => attempt.createdAt.getTime()).sort((a, b) => b - a);
  const limits = [
    (times[0] ?? 0) + 60_000,
    times.filter(time => time > now.getTime() - HOUR).length >= 5 ? times[4]! + HOUR : 0,
    times.filter(time => time > now.getTime() - DAY).length >= 20 ? times[19]! + DAY : 0,
  ];
  return Math.max(0, Math.ceil((Math.max(...limits) - now.getTime()) / 1000));
}

export async function reserveHouseholdInvitation(householdId: string, userId: string) {
  return prisma.$transaction(async tx => {
    // Lock both scopes in a stable order across processes, not just this server.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-user:${userId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-household:${householdId}`}))`;
    const now = new Date();
    const attempts = await tx.householdInvitationAttempt.findMany({
      where: { createdAt: { gt: new Date(now.getTime() - DAY) }, OR: [{ householdId }, { requestedById: userId }] },
      select: { createdAt: true },
    });
    const retryAfter = invitationRetryAfter(attempts, now);
    if (retryAfter) return { allowed: false as const, retryAfter };
    // Failed sends count too; retries cannot bypass the persistent quota.
    const attempt = await tx.householdInvitationAttempt.create({ data: { householdId, requestedById: userId } });
    return { allowed: true as const, attemptId: attempt.id };
  });
}
