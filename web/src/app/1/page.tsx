import Link from "next/link";

export default function DesignOnePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#c4b5fd_0%,#ddd6fe_32%,#f5f5f4_100%)] px-6 py-14 text-stone-900">
      <div className="pointer-events-none absolute -left-16 top-8 h-72 w-72 rounded-full bg-violet-300/40 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-fuchsia-200/40 blur-3xl" />

      <section className="relative mx-auto w-full max-w-6xl space-y-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-3xl border border-white/80 bg-white/72 p-8 shadow-[0_20px_50px_rgba(51,65,85,0.14)] backdrop-blur-xl">
            <p className="text-xs tracking-[0.3em] text-stone-500 uppercase">Concept 01 · Soft Aurora</p>
            <h1 className="mt-3 max-w-2xl text-5xl leading-tight font-semibold">A lighter blend of editorial focus and luminous glass.</h1>
            <p className="mt-4 max-w-2xl text-stone-600">
              This remix takes the structure of design 03 and the glow language of design 05 to create a calm but vivid
              planning home.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                ["Meals this week", "20"],
                ["Quick prep plans", "6"],
                ["List confidence", "91%"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                  <p className="text-xs tracking-[0.2em] text-stone-500 uppercase">{label}</p>
                  <p className="mt-2 text-3xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link href="/recipes" className="rounded-2xl bg-linear-to-r from-indigo-600 to-fuchsia-500 px-4 py-2 font-semibold text-white">
                Recipe collection
              </Link>
              <Link href="/planner" className="rounded-2xl border border-stone-300 bg-white/85 px-4 py-2 font-semibold text-stone-800">
                Weekly planner
              </Link>
              <Link href="/shopping-list" className="rounded-2xl border border-stone-300 bg-white/85 px-4 py-2 font-semibold text-stone-800">
                Shopping list
              </Link>
            </div>
          </article>

          <aside className="space-y-4">
            {[
              ["Editorial calm", "Typography-first hierarchy keeps decisions clear."],
              ["Glass clarity", "Frosted panels separate content without visual noise."],
              ["Gradient cues", "Accent transitions highlight key actions only."],
            ].map(([title, text]) => (
              <article
                key={title}
                className="rounded-3xl border border-white/80 bg-white/68 p-5 shadow-[0_14px_35px_rgba(51,65,85,0.12)] backdrop-blur-xl"
              >
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-sm text-stone-600">{text}</p>
              </article>
            ))}
          </aside>
        </div>

        <nav className="flex flex-wrap gap-2 text-sm">
          {[1, 2, 3, 4, 5].map((n) => (
            <Link key={n} href={`/${n}`} className="rounded-full border border-stone-300 bg-white/75 px-3 py-1 hover:bg-white">
              /{n}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
