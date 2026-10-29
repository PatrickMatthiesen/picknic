import type { ReactNode } from "react";
import { AppNav } from "@/app/_components/app-nav";

export default function CookLayout({ children }: { children: ReactNode }) {
  return (
    <main className="app-theme-page app-shell">
      <AppNav currentPath="/cook" />
      <div className="cook-workspace">{children}</div>
    </main>
  );
}
