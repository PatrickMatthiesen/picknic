import Link from "next/link";

export default function DesignThreePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-stone-100 px-6 py-16 text-stone-900">
      <div className="pointer-events-none absolute left-1/3 top-0 h-72 w-72 rounded-full bg-indigo-200/45 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-12 h-64 w-64 rounded-full bg-rose-200/40 blur-3xl" />

      <section className="relative mx-auto w-full max-w-6xl space-y-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-3xl border border-white/70 bg-white/75 p-8 shadow-[0_18px_45px_rgba(28,25,23,0.10)] backdrop-blur-xl">
            <p className="text-xs tracking-[0.28em] text-stone-500 uppercase">Concept 03 · Editorial Glass</p>
            <h1 className="mt-3 max-w-2xl text-5xl leading-tight font-semibold">
              A calm, premium interface sharpened with modern component surfaces.
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-stone-600">
              This evolution keeps the original editorial clarity, then layers in Cantaro-like glass cards, gradient
              action moments, and denser utility panels.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                ["Meals planned", "18"],
                ["Auto items", "24"],
                ["Pantry coverage", "67%"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                  <p className="text-xs tracking-[0.2em] text-stone-500 uppercase">{label}</p>
                  <p className="mt-2 text-3xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </article>

          <aside className="space-y-4">
            <article className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-[0_14px_35px_rgba(28,25,23,0.08)] backdrop-blur-xl">
              <h2 className="text-2xl font-semibold">Tonight</h2>
              <p className="mt-2 text-sm text-stone-600">Creamy tomato gnocchi with basil and crispy chickpeas.</p>
              <ul className="mt-4 space-y-1 text-sm text-stone-700">
                <li>4 servings</li>
                <li>25 minute prep</li>
                <li>Pantry-aware ingredient list</li>
              </ul>
            </article>
            <article className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-[0_14px_35px_rgba(28,25,23,0.08)] backdrop-blur-xl">
              <h2 className="text-2xl font-semibold">Next action</h2>
              <p className="mt-2 text-sm text-stone-600">Refresh your list to include this week&apos;s latest meal edits.</p>
              <Link
                href="/shopping-list"
                className="mt-4 inline-block rounded-2xl bg-linear-to-r from-indigo-600 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white"
              >
                Open smart list
              </Link>
            </article>
          </aside>
        </div>

        <article className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-[0_14px_35px_rgba(28,25,23,0.08)] backdrop-blur-xl">
          <h2 className="text-sm tracking-[0.24em] text-stone-500 uppercase">Weekly rhythm</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              ["Planning confidence", 92, "from-indigo-500 to-violet-500"],
              ["Prep completion", 74, "from-cyan-500 to-blue-500"],
              ["Pantry alignment", 67, "from-emerald-500 to-teal-500"],
            ].map(([label, value, gradient]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-xs text-stone-600">
                  <span>{label}</span>
                  <span>{value}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                  <div className={`h-full bg-linear-to-r ${gradient}`} style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link href="/recipes" className="rounded-full border border-stone-300 bg-white/80 px-4 py-2 hover:bg-white">
              Recipe collection
            </Link>
            <Link href="/planner" className="rounded-full border border-stone-300 bg-white/80 px-4 py-2 hover:bg-white">
              Weekly planner
            </Link>
            <Link href="/pantry" className="rounded-full border border-stone-300 bg-white/80 px-4 py-2 hover:bg-white">
              Pantry
            </Link>
          </div>
        </article>

        <nav className="flex flex-wrap gap-2 text-sm">
          {[1, 2, 3, 4, 5].map((n) => (
            <Link key={n} href={`/${n}`} className="rounded-full border border-stone-400 bg-white/80 px-3 py-1 hover:bg-white">
              /{n}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
