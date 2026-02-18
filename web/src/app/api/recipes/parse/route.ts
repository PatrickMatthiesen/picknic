import { NextResponse } from "next/server";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { parseRecipeWithGitHubModels } from "@/lib/recipe-parser";

type ParsePayload = { text?: unknown };

export async function POST(request: Request) {
  const payload = (await request.json()) as ParsePayload;
  const text = typeof payload.text === "string" ? payload.text.trim() : "";

  if (!text) {
    return NextResponse.json({ error: "Recipe text is required." }, { status: 400 });
  }

  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  try {
    const recipe = await parseRecipeWithGitHubModels(text);
    return NextResponse.json({ data: recipe });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parsing failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
