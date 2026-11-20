import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AppPageShell } from "@/app/_components/page-shell";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { listRecipeCaptures } from "@/lib/recipe-captures";
import { RecipeCapturesClient } from "./recipe-captures-client";

export default async function RecipeCapturesPage() {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  const captures = membership
    ? await listRecipeCaptures({ userId, householdId: membership.householdId }).catch(() => undefined)
    : undefined;

  return (
    <AppPageShell
      currentPath="/recipes/captures"
      title="Recipe photo inbox"
      maxWidthClassName="max-w-3xl"
      eyebrow={<Link className="inline-flex min-h-11 items-center gap-2 text-[var(--primary-hover)] hover:underline" href="/recipes"><ArrowLeft aria-hidden="true" size={16} /> Recipes</Link>}
    >
      {membership ? <RecipeCapturesClient initialCaptures={captures} /> : <p>No household is connected to this account.</p>}
    </AppPageShell>
  );
}
