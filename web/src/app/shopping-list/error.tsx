"use client";

import Link from "next/link";

export default function ShoppingListError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app-theme-page grid min-h-[50vh] place-items-center p-6">
      <section className="app-theme-card grid max-w-lg gap-3 rounded-lg p-6" role="alert">
        <h1 className="text-xl font-semibold">Shopping list could not be updated</h1>
        <p className="app-theme-muted">Check your connection and try again. Your saved list remains available.</p>
        <div className="flex flex-wrap gap-3">
          <button className="app-theme-primary-button rounded-lg px-4 py-2" onClick={reset} type="button">Try again</button>
          <Link className="app-theme-secondary-button rounded-lg px-4 py-2" href="/shopping-list?list=standalone">Open standalone list</Link>
        </div>
      </section>
    </main>
  );
}
