import Link from "next/link";
import { AppPageShell } from "@/app/_components/page-shell";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { RecipeCapturesClient } from "./recipe-captures-client";

export default async function RecipeCapturesPage() {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  return (
    <AppPageShell
      currentPath="/recipes/captures"
      title="Recipe photo inbox"
      maxWidthClassName="max-w-3xl"
      headerChildren={<Link className="app-theme-secondary-button min-h-11 px-4 py-2 text-sm" href="/recipes">Back to recipes</Link>}
    >
      {membership ? <RecipeCapturesClient /> : <p>No household is connected to this account.</p>}
    </AppPageShell>
  );
}
