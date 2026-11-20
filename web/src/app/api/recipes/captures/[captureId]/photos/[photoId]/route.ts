import { NextResponse } from "next/server";
import { readRecipeCapturePhoto, resolveRecipeCaptureOwner } from "@/lib/recipe-captures";

type PhotoRoute = { params: Promise<{ captureId: string; photoId: string }> };

export async function GET(_request: Request, { params }: PhotoRoute) {
  const owner = await resolveRecipeCaptureOwner();
  if (!owner) return NextResponse.json({ error: "No household found for this user." }, { status: 400 });

  const { captureId, photoId } = await params;
  const photo = await readRecipeCapturePhoto(owner, captureId, photoId);
  if (!photo) return NextResponse.json({ error: "Recipe capture photo not found." }, { status: 404 });

  return new Response(Uint8Array.from(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
