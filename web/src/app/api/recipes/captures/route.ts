import { after, NextResponse } from "next/server";
import { readRecipeCapturePhotos, RecipeCaptureUploadError } from "@/lib/recipe-capture-upload";
import {
  createRecipeCapture,
  extractRecipeCapture,
  listRecipeCaptures,
  resolveRecipeCaptureOwner,
} from "@/lib/recipe-captures";

export async function GET() {
  const owner = await resolveRecipeCaptureOwner();
  if (!owner) return NextResponse.json({ error: "No household found for this user." }, { status: 400 });

  const data = await listRecipeCaptures(owner);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const owner = await resolveRecipeCaptureOwner();
  if (!owner) return NextResponse.json({ error: "No household found for this user." }, { status: 400 });

  try {
    const photos = await readRecipeCapturePhotos(request);
    const capture = await createRecipeCapture(owner, photos);
    if (!capture) {
      return NextResponse.json({ error: "Your capture inbox is full. Delete a capture before adding more photos." }, { status: 409 });
    }

    after(() => extractRecipeCapture(capture.summary.id, capture.attemptId));
    return NextResponse.json({ data: capture.summary }, { status: 202 });
  } catch (error) {
    if (error instanceof RecipeCaptureUploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
