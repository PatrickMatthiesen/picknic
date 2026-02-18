import Link from "next/link";
import { getSignInUrl, getSignUpUrl, signOut, withAuth } from "@workos-inc/authkit-nextjs";

export default async function Home() {
  const { user, organizationId, role } = await withAuth();

  if (!user) {
    const signInUrl = await getSignInUrl();
    const signUpUrl = await getSignUpUrl();

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-start justify-center gap-6 px-6 py-12">
        <h1 className="text-4xl font-semibold tracking-tight">Plan meals with Picknic</h1>
        <p className="text-zinc-600">
          Build weekly plans, maintain a household recipe collection, and auto-generate shopping lists from your
          planned recipes.
        </p>
        <div className="flex gap-3">
          <Link className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white" href={signInUrl}>
            Sign in
          </Link>
          <Link className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium" href={signUpUrl}>
            Create account
          </Link>
        </div>
      </main>
    );
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Welcome back, {displayName}</h1>
        <p className="text-zinc-600">Your account is connected with WorkOS and ready for profile-based planning.</p>
      </header>

      <section className="rounded-xl border border-zinc-200 p-5">
        <h2 className="text-lg font-semibold">Implementation in progress</h2>
        {organizationId ? (
          <p className="mt-2 text-sm text-zinc-600">
            Household context: {organizationId} ({role ?? "member"})
          </p>
        ) : null}
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-700">
          <li>Recipe collection foundation with Prisma schema</li>
          <li>Weekly meal plan and shopping list domain models</li>
          <li>Household collaboration and pantry inventory models</li>
        </ul>
        <Link className="mt-4 inline-block text-sm font-medium underline" href="/recipes">
          Open recipes
        </Link>
        <Link className="mt-2 block text-sm font-medium underline" href="/planner">
          Open meal planner
        </Link>
        <Link className="mt-2 block text-sm font-medium underline" href="/shopping-list">
          Open shopping list
        </Link>
        <Link className="mt-2 block text-sm font-medium underline" href="/pantry">
          Open pantry
        </Link>
        <Link className="mt-2 block text-sm font-medium underline" href="/recipes/import">
          Open recipe parser
        </Link>
      </section>

      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
