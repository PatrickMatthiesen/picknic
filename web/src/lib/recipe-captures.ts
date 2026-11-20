import { randomUUID } from "node:crypto";
import { Prisma, RecipeCaptureStatus } from "@prisma/client";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { parseRecipePhotosWithAi } from "@/lib/recipe-parser";

const maxCaptures = 20;
const retryAfterMs = 3 * 60 * 1000;
const summarySelect = {
  id: true,
  status: true,
  draft: true,
  createdAt: true,
  updatedAt: true,
  savedRecipeId: true,
  savedRecipe: { select: { title: true } },
  photos: { orderBy: { position: "asc" }, select: { id: true } },
} satisfies Prisma.RecipeCaptureSelect;

type CaptureRecord = Prisma.RecipeCaptureGetPayload<{ select: typeof summarySelect }>;
type CaptureOwner = { userId: string; householdId: string };
type CapturePhoto = { contentType: string; bytes: Uint8Array<ArrayBuffer>; position: number };

export type RecipeCaptureSummary = {
  id: string;
  status: RecipeCaptureStatus;
  title: string | null;
  createdAt: string;
  canRetry: boolean;
  savedRecipeId: string | null;
  photos: { id: string }[];
};

function retryCutoff() {
  return new Date(Date.now() - retryAfterMs);
}

function summarizeCapture(capture: CaptureRecord): RecipeCaptureSummary {
  const { id, draft, status, createdAt, updatedAt, savedRecipeId, savedRecipe, photos } = capture;
  const extractedTitle = draft && typeof draft === "object" && !Array.isArray(draft) && typeof draft.title === "string"
    ? draft.title
    : null;
  const interrupted = (status === "PENDING" || status === "PROCESSING") && updatedAt <= retryCutoff();
  return {
    id,
    status,
    title: savedRecipe?.title ?? extractedTitle,
    createdAt: createdAt.toISOString(),
    canRetry: savedRecipeId === null && (status === "FAILED" || interrupted),
    savedRecipeId,
    photos,
  };
}

export async function resolveRecipeCaptureOwner(): Promise<CaptureOwner | null> {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  return membership ? { userId, householdId: membership.householdId } : null;
}

export async function listRecipeCaptures(owner: CaptureOwner) {
  const captures = await prisma.recipeCapture.findMany({
    where: owner,
    select: summarySelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: maxCaptures,
  });
  return captures.map(summarizeCapture);
}

export async function createRecipeCapture(owner: CaptureOwner, photos: CapturePhoto[]) {
  const attemptId = randomUUID();
  const capture = await prisma.$transaction(async (tx) => {
    const lockKey = `recipe-captures:${owner.userId}:${owner.householdId}`;
    // Serialize the quota check and insert for concurrent uploads in this inbox.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    if (await tx.recipeCapture.count({ where: owner }) >= maxCaptures) return null;

    return tx.recipeCapture.create({
      data: { ...owner, attemptId, photos: { create: photos } },
      select: summarySelect,
    });
  });

  return capture ? { summary: summarizeCapture(capture), attemptId } : null;
}

export async function retryRecipeCapture(owner: CaptureOwner, id: string) {
  const attemptId = randomUUID();
  const capture = await prisma.$transaction(async (tx) => {
    const queued = await tx.recipeCapture.updateMany({
      where: {
        ...owner,
        id,
        savedRecipeId: null,
        OR: [
          { status: "FAILED" },
          { status: { in: ["PENDING", "PROCESSING"] }, updatedAt: { lte: retryCutoff() } },
        ],
      },
      data: { attemptId, status: "PENDING", draft: Prisma.DbNull, warnings: [] },
    });
    const record = await tx.recipeCapture.findFirst({ where: { ...owner, id }, select: summarySelect });

    if (!record) return { result: "missing" } as const;
    if (!queued.count) return { result: "unavailable" } as const;
    return { result: "queued", summary: summarizeCapture(record), attemptId } as const;
  });

  return capture;
}

export async function extractRecipeCapture(id: string, attemptId: string) {
  const claimed = await prisma.recipeCapture.updateMany({
    where: { id, attemptId, status: "PENDING" },
    data: { status: "PROCESSING" },
  });
  if (!claimed.count) return;

  const activeAttempt = { id, attemptId, status: "PROCESSING" } as const;
  const capture = await prisma.recipeCapture.findFirst({
    where: activeAttempt,
    select: {
      photos: { orderBy: { position: "asc" }, select: { contentType: true, bytes: true } },
    },
  });
  if (!capture) return;

  let parsed: Awaited<ReturnType<typeof parseRecipePhotosWithAi>>;
  try {
    parsed = await parseRecipePhotosWithAi(capture.photos);
  } catch {
    await prisma.recipeCapture.updateMany({
      where: activeAttempt,
      data: { attemptId: null, status: "FAILED" },
    });
    return;
  }

  await prisma.recipeCapture.updateMany({
    where: activeAttempt,
    data: { attemptId: null, status: "READY", draft: parsed.draft, warnings: parsed.warnings },
  });
}

export async function deleteRecipeCapture(owner: CaptureOwner, id: string) {
  return prisma.recipeCapture.deleteMany({ where: { ...owner, id } });
}

export async function readRecipeCapturePhoto(owner: CaptureOwner, captureId: string, photoId: string) {
  return prisma.recipeCapturePhoto.findFirst({
    where: { id: photoId, captureId, capture: owner },
    select: { bytes: true, contentType: true },
  });
}
