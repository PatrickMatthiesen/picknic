"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  applyThemeChoice,
  getInitialThemeChoice,
  isDarkThemeChoice,
  persistThemeChoice,
  THEME_CHOICES,
  type ThemeChoice,
} from "@/lib/theme-choice";

export default function DesignTwoPage() {
  const [theme, setTheme] = useState<ThemeChoice>(getInitialThemeChoice);
  const isDark = isDarkThemeChoice(theme);

  useEffect(() => {
    persistThemeChoice(theme);
    applyThemeChoice(theme);
  }, [theme]);

  return (
    <main
      className={`relative min-h-screen overflow-hidden px-6 py-14 ${
        isDark
          ? "bg-[radial-gradient(circle_at_top,#1e1b4b_0%,#0f172a_45%,#020617_100%)] text-stone-100"
          : "bg-[radial-gradient(circle_at_15%_0%,#bfdbfe_0%,#ddd6fe_38%,#f5f5f4_100%)] text-stone-900"
      }`}
    >
      <div
        className={`pointer-events-none absolute -left-20 top-12 h-72 w-72 rounded-full blur-3xl ${
          isDark ? "bg-cyan-500/25" : "bg-cyan-200/40"
        }`}
      />
      <div
        className={`pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full blur-3xl ${
          isDark ? "bg-violet-500/25" : "bg-violet-300/35"
        }`}
      />

      <section className="mx-auto max-w-6xl space-y-8">
        <div
          className={`inline-flex items-center gap-1 rounded-full border p-1 text-xs ${
            isDark ? "border-white/20 bg-white/10" : "border-stone-200 bg-white/80"
          }`}
        >
          {THEME_CHOICES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                theme === value
                  ? isDark
                    ? "bg-white text-stone-900"
                    : "bg-stone-900 text-white"
                  : isDark
                    ? "text-stone-200 hover:bg-white/12"
                    : "text-stone-700 hover:bg-stone-200"
              }`}
            >
              {value[0].toUpperCase()}
              {value.slice(1)}
            </button>
          ))}
        </div>

        <article
          className={`rounded-3xl border p-8 shadow-[0_20px_50px_rgba(51,65,85,0.14)] backdrop-blur-xl ${
            isDark ? "border-white/20 bg-white/8" : "border-white/80 bg-white/72"
          }`}
        >
          <p className={`text-xs tracking-[0.25em] uppercase ${isDark ? "text-stone-300" : "text-stone-500"}`}>Concept 02 · Tempo Glass</p>
          <h1 className="mt-3 text-5xl leading-tight font-semibold">A livelier editorial layout with polished utility cards.</h1>
          <p className={`mt-4 max-w-3xl text-lg ${isDark ? "text-stone-300" : "text-stone-600"}`}>
            Design 02 now carries the rhythm and readability of design 03, while leaning into design 05&apos;s ambient glow and
            frosted surfaces, with a full dark-mode counterpart.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
            <Link className="rounded-2xl bg-linear-to-r from-indigo-600 to-fuchsia-500 px-4 py-2 text-white" href="/recipes">
              Recipes
            </Link>
            <Link
              className={`rounded-2xl border px-4 py-2 ${
                isDark ? "border-white/25 bg-white/10 text-stone-100 hover:bg-white/14" : "border-stone-300 bg-white/85 text-stone-800"
              }`}
              href="/planner"
            >
              Planner
            </Link>
            <Link
              className={`rounded-2xl border px-4 py-2 ${
                isDark ? "border-white/25 bg-white/10 text-stone-100 hover:bg-white/14" : "border-stone-300 bg-white/85 text-stone-800"
              }`}
              href="/shopping-list"
            >
              Shopping list
            </Link>
          </div>
        </article>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article
            className={`rounded-3xl border p-6 shadow-[0_14px_35px_rgba(51,65,85,0.12)] backdrop-blur-xl ${
              isDark ? "border-white/20 bg-white/8" : "border-white/80 bg-white/70"
            }`}
          >
            <h2 className="text-2xl font-semibold">Focused weekly tempo</h2>
            <p className={`mt-2 text-sm ${isDark ? "text-stone-300" : "text-stone-600"}`}>
              Balanced layout blocks keep planning detail dense but still breathable.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Planning confidence", 89, "from-indigo-500 to-violet-500"],
                ["List automation", 76, "from-cyan-500 to-blue-500"],
              ].map(([label, value, gradient]) => (
                <div key={label}>
                  <div className={`mb-1 flex justify-between text-xs ${isDark ? "text-stone-300" : "text-stone-600"}`}>
                    <span>{label}</span>
                    <span>{value}%</span>
                  </div>
                  <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-white/15" : "bg-stone-200"}`}>
                    <div className={`h-full bg-linear-to-r ${gradient}`} style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <aside className="space-y-4">
            {[
              ["Quick scan", "High-level metrics stay visible at every breakpoint."],
              ["Calm contrast", "Soft neutrals improve reading comfort during planning."],
              ["Action glow", "Gradient buttons signal key transitions with restraint."],
            ].map(([title, body]) => (
              <article
                key={title}
                className={`rounded-3xl border p-5 shadow-[0_14px_35px_rgba(51,65,85,0.12)] backdrop-blur-xl ${
                  isDark ? "border-white/20 bg-white/8" : "border-white/80 bg-white/68"
                }`}
              >
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className={`mt-2 text-sm ${isDark ? "text-stone-300" : "text-stone-600"}`}>{body}</p>
              </article>
            ))}
          </aside>
        </div>

        <nav className="flex flex-wrap gap-2 text-sm">
          {[1, 2, 3, 4, 5].map((n) => (
            <Link
              key={n}
              href={`/${n}`}
              className={`rounded-full border px-3 py-1 font-semibold ${
                isDark ? "border-white/25 bg-white/10 hover:bg-white/14" : "border-stone-300 bg-white/75"
              }`}
            >
              /{n}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
