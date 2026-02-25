import { ReactNode } from "react";
import { AppNav } from "@/app/_components/app-nav";

type AppPageShellProps = {
  currentPath: string;
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  headerChildren?: ReactNode;
  maxWidthClassName?: string;
  children: ReactNode;
};

export function AppPageShell({
  currentPath,
  title,
  subtitle,
  eyebrow,
  headerChildren,
  maxWidthClassName = "max-w-4xl",
  children,
}: AppPageShellProps) {
  return (
    <main className="app-theme-page relative overflow-hidden px-6 py-12">
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-cyan-200/35 blur-3xl dark:bg-cyan-500/25" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-violet-300/35 blur-3xl dark:bg-violet-500/25" />
      <div className={`mx-auto flex min-h-screen w-full ${maxWidthClassName} flex-col gap-6`}>
        <header className="app-theme-card space-y-3 rounded-3xl p-7">
          {eyebrow ? <p className="text-xs tracking-[0.24em] uppercase app-theme-muted">{eyebrow}</p> : null}
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="app-theme-muted">{subtitle}</p> : null}
          <AppNav currentPath={currentPath} />
          {headerChildren ? headerChildren : null}
        </header>

        {children}
      </div>
    </main>
  );
}
