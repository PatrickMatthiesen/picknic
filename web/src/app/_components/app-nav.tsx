"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOutAction } from "@/app/_actions/auth-actions";
import { Dropdown } from "@/app/_components/dropdown";
import { applyThemeChoice, getInitialThemeChoice, persistThemeChoice, THEME_CHOICES, ThemeChoice } from "@/lib/theme-choice";

const NAV_ITEMS = [
  { href: "/recipes", label: "recipes" },
  { href: "/planner", label: "Planner" },
  { href: "/shopping-list", label: "Shopping" },
  { href: "/pantry", label: "Pantry" },
];

function isActive(currentPath: string, href: string) {
  if (href === "/") {
    return currentPath === "/";
  }

  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function AppNav({ currentPath }: { currentPath: string }) {
  const [theme, setTheme] = useState<ThemeChoice>(getInitialThemeChoice);
  const dropdownOptionClass = "app-dropdown-option rounded-xl px-3 py-2 text-left font-medium";

  useEffect(() => {
    persistThemeChoice(theme);
    applyThemeChoice(theme);
  }, [theme]);

  return (
    <nav className="pt-1">
      <div className="fixed top-4 right-6 z-40 flex flex-wrap items-center gap-2">
        <Dropdown
          autoCloseOnOutsideClick
          className="relative"
          label="UI theme"
          panelClassName="app-theme-card absolute right-0 z-20 mt-2 w-40 rounded-2xl p-2"
          summaryClassName="app-theme-secondary-button cursor-pointer list-none rounded-full px-4 py-2 text-sm font-medium"
        >
          <div className="flex flex-col gap-1 text-sm">
            {THEME_CHOICES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={`${dropdownOptionClass} ${theme === value ? "app-theme-primary-button" : "app-theme-link"}`}
              >
                {value[0].toUpperCase()}
                {value.slice(1)}
              </button>
            ))}
          </div>
        </Dropdown>

        <Dropdown
          autoCloseOnOutsideClick
          className="relative"
          label="Profile"
          panelClassName="app-theme-card absolute right-0 z-20 mt-2 w-44 rounded-2xl p-2"
          summaryClassName="app-theme-secondary-button cursor-pointer list-none rounded-full px-4 py-2 text-sm font-medium"
        >
          <div className="flex flex-col gap-1 text-sm">
            <button type="button" className={`app-theme-link ${dropdownOptionClass}`}>
              Profile
            </button>
            <button type="button" className={`app-theme-link ${dropdownOptionClass}`}>
              Settings
            </button>
            <form action={signOutAction}>
              <button type="submit" className={`app-theme-link ${dropdownOptionClass} w-full`}>
                Sign out
              </button>
            </form>
          </div>
        </Dropdown>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-105 grid-cols-4 gap-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(currentPath, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-9 items-center justify-center px-3 text-sm font-semibold transition ${
                  active
                    ? "border-b-2 border-indigo-600 text-indigo-700 dark:border-fuchsia-300 dark:text-fuchsia-300"
                    : "app-theme-muted hover:text-stone-900 dark:hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
