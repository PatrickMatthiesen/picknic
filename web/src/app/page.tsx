import Link from "next/link";
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";

export default async function Home() {
  const { user } = await withAuth();
  if (user) {
    redirect("/planner");
  }

  return (
    <main className="app-theme-page px-6 py-12">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-start justify-center gap-6">
        <section className="app-theme-card w-full p-8">
          <p className="font-recipe text-4xl">Picknic</p>
          <h1 className="mt-5 text-3xl font-semibold">A calmer way to plan dinner.</h1>
          <p className="app-theme-muted mt-3">
            Build weekly plans, maintain a household recipe collection, and auto-generate shopping lists from your
            planned recipes.
          </p>
          <div className="mt-6 flex gap-3">
            <Link className="app-theme-primary-button rounded-lg px-5 py-2.5 text-sm font-medium" href="/sign-in">
              Sign in
            </Link>
            <Link className="app-theme-secondary-button rounded-lg px-5 py-2.5 text-sm font-medium" href="/sign-up">
              Create account
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
