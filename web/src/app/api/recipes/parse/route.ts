import { NextResponse } from "next/server";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { parseRecipeWithAi, RecipeParserNotConfiguredError } from "@/lib/recipe-parser";

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
    const recipe = await parseRecipeWithAi(text);
    return NextResponse.json({ data: recipe });
  } catch (error) {
    if (error instanceof RecipeParserNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("Recipe parsing failed.", error);
    return NextResponse.json({ error: "Recipe parsing failed." }, { status: 502 });
  }
}
