"use client";

import Link from "next/link";
import { BookOpen, CalendarDays, ChefHat, PackageOpen, ShoppingBasket, SunMoon } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { signOutAction } from "@/app/_actions/auth-actions";
import { SmallSelect, type SmallSelectOption } from "@/app/_components/small-select";
import {
  applyThemeChoice,
  getThemeChoiceServerSnapshot,
  getThemeChoiceSnapshot,
  setThemeChoice,
  subscribeThemeChoice,
  type ThemeChoice,
} from "@/lib/theme-choice";

const NAV_ITEMS = [
  { href: "/planner", label: "Plan", icon: CalendarDays },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/cook", label: "Cook", icon: ChefHat },
  { href: "/shopping-list", label: "Shopping", icon: ShoppingBasket },
  { href: "/pantry", label: "Pantry", icon: PackageOpen },
];

const THEME_OPTIONS: readonly SmallSelectOption<ThemeChoice>[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function isActive(currentPath: string, href: string) {
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function AppNav({ currentPath }: { currentPath: string }) {
  const theme = useSyncExternalStore(subscribeThemeChoice, getThemeChoiceSnapshot, getThemeChoiceServerSnapshot);

  useEffect(() => applyThemeChoice(theme), [theme]);

  return (
    <>
      <aside className="app-sidebar" aria-label="Primary navigation">
        <Link className="app-wordmark" href="/planner">Picknic</Link>
        <nav className="app-sidebar-links">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link className={isActive(currentPath, href) ? "is-active" : undefined} href={href} key={href}>
              <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="app-sidebar-tools">
          <SmallSelect
            ariaLabel="UI theme"
            icon={<SunMoon aria-hidden="true" size={17} />}
            onChange={setThemeChoice}
            options={THEME_OPTIONS}
            value={theme}
          />
          <form action={signOutAction}>
            <button className="app-nav-signout" type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      <nav className="app-mobile-nav" aria-label="Primary navigation">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link className={isActive(currentPath, href) ? "is-active" : undefined} href={href} key={href}>
            <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
