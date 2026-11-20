import { after, NextResponse } from "next/server";
import { deleteRecipeCapture, extractRecipeCapture, resolveRecipeCaptureOwner, retryRecipeCapture } from "@/lib/recipe-captures";

type CaptureRoute = { params: Promise<{ captureId: string }> };

export async function POST(_request: Request, { params }: CaptureRoute) {
  const owner = await resolveRecipeCaptureOwner();
  if (!owner) return NextResponse.json({ error: "No household found for this user." }, { status: 400 });

  const { captureId } = await params;
  const capture = await retryRecipeCapture(owner, captureId);
  if (capture.result === "missing") {
    return NextResponse.json({ error: "Recipe capture not found." }, { status: 404 });
  }
  if (capture.result === "unavailable") {
    return NextResponse.json({ error: "This recipe capture cannot be retried right now." }, { status: 409 });
  }

  after(() => extractRecipeCapture(captureId, capture.attemptId));
  return NextResponse.json({ data: capture.summary }, { status: 202 });
}

export async function DELETE(_request: Request, { params }: CaptureRoute) {
  const owner = await resolveRecipeCaptureOwner();
  if (!owner) return NextResponse.json({ error: "No household found for this user." }, { status: 400 });

  const { captureId } = await params;
  const deleted = await deleteRecipeCapture(owner, captureId);
  if (!deleted.count) return NextResponse.json({ error: "Recipe capture not found." }, { status: 404 });

  return new Response(null, { status: 204 });
}
