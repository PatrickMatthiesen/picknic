import Link from "next/link";

export default function DesignFourPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#1e1b4b_0%,_#0f172a_45%,_#020617_100%)] px-6 py-10 text-stone-100">
      <div className="pointer-events-none absolute -left-16 top-6 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />

      <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl border border-white/20 bg-white/8 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <p className="text-xs tracking-[0.24em] text-stone-300 uppercase">Concept 04 · Night Editorial</p>
          <h1 className="mt-3 text-2xl font-semibold">Picknic operations</h1>
          <nav className="mt-6 space-y-2 text-sm">
            {[
              ["/recipes", "Recipes"],
              ["/planner", "Planner"],
              ["/shopping-list", "Shopping list"],
              ["/pantry", "Pantry"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="block rounded-xl border border-white/15 bg-white/6 px-3 py-2 text-stone-100 hover:bg-white/12">
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Meals planned", "21", "from-emerald-500 to-teal-500"],
              ["Items to buy", "34", "from-violet-500 to-fuchsia-500"],
              ["Pantry coverage", "62%", "from-cyan-500 to-blue-500"],
            ].map(([label, value, gradient]) => (
              <article
                key={label}
                className={`rounded-3xl border border-white/25 bg-gradient-to-br ${gradient} p-5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.35)]`}
              >
                <p className="text-xs uppercase tracking-[0.2em] text-white/80">{label}</p>
                <p className="mt-3 text-4xl font-semibold">{value}</p>
              </article>
            ))}
          </div>

          <article className="rounded-3xl border border-white/20 bg-white/8 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
            <h2 className="text-xl font-semibold">Weekly flow</h2>
            <p className="mt-2 text-sm text-stone-300">
              A command-oriented remix of design 03 and 05: editorial spacing, frosted depth, and focused gradient highlights.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {["Monday batch prep", "Mid-week pantry check", "Friday leftovers", "Weekend plan reset"].map((item) => (
                <div key={item} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-stone-200">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                ["Sync health", 96, "from-emerald-500 to-teal-500"],
                ["Queue pressure", 41, "from-cyan-500 to-blue-500"],
                ["Coverage", 68, "from-indigo-500 to-fuchsia-500"],
              ].map(([label, value, gradient]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-xs text-stone-300">
                    <span>{label}</span>
                    <span>{value}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/15">
                    <div className={`h-full bg-gradient-to-r ${gradient}`} style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <nav className="mx-auto mt-8 flex w-full max-w-6xl flex-wrap gap-2 text-sm">
        {[1, 2, 3, 4, 5].map((n) => (
          <Link key={n} href={`/${n}`} className="rounded-full border border-white/25 bg-white/8 px-3 py-1 hover:bg-white/14">
            /{n}
          </Link>
        ))}
      </nav>
    </main>
  );
}
