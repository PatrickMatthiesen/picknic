import Link from "next/link";

export default function DesignFivePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#c4b5fd_0%,#ddd6fe_30%,#f5f5f4_100%)] px-6 py-14 text-stone-900">
      <div className="pointer-events-none absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-fuchsia-300/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-12 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />

      <section className="relative mx-auto w-full max-w-6xl space-y-8">
        <header className="max-w-3xl rounded-3xl border border-white/80 bg-white/70 p-8 shadow-[0_20px_50px_rgba(51,65,85,0.15)] backdrop-blur-xl">
          <p className="text-xs tracking-[0.25em] text-stone-500 uppercase">Concept 05 · Light Glass</p>
          <h1 className="mt-3 text-5xl leading-tight font-semibold tracking-tight">A luminous editorial shell for modern meal planning.</h1>
          <p className="mt-4 text-base text-stone-600">
            The softest mix of Cantaro&apos;s glass components and Picknic&apos;s design 03 composure: airy, premium, and practical.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          {[
            ["Recipe cards", "Translucent containers with crisp metadata and action rows."],
            ["Weekly board", "Quiet layout rhythm that keeps Monday-Sunday scanning effortless."],
            ["Smart list", "Gradient indicators for auto vs. manual shopping actions."],
          ].map(([title, text]) => (
            <article
              key={title}
              className="rounded-3xl border border-white/80 bg-white/65 p-6 shadow-[0_14px_35px_rgba(51,65,85,0.12)] backdrop-blur-xl transition hover:-translate-y-0.5"
            >
              <h2 className="text-2xl font-semibold">{title}</h2>
              <p className="mt-3 text-sm text-stone-600">{text}</p>
            </article>
          ))}
        </div>

        <article className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-[0_14px_35px_rgba(51,65,85,0.12)] backdrop-blur-xl">
          <p className="text-sm text-stone-600">Open app modules</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {[
              ["/recipes", "Recipes"],
              ["/planner", "Planner"],
              ["/shopping-list", "Shopping list"],
              ["/pantry", "Pantry"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="rounded-full border border-stone-300 bg-white/75 px-4 py-2 font-semibold text-stone-800 hover:bg-white"
              >
                {label}
              </Link>
            ))}
          </div>
        </article>

        <nav className="flex flex-wrap gap-2 text-sm">
          {[1, 2, 3, 4, 5].map((n) => (
            <Link key={n} href={`/${n}`} className="rounded-full border border-stone-300 bg-white/70 px-3 py-1 backdrop-blur hover:bg-white">
              /{n}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
