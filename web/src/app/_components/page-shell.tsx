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
  maxWidthClassName = "max-w-7xl",
  children,
}: AppPageShellProps) {
  return (
    <main className="app-theme-page app-shell">
      <AppNav currentPath={currentPath} />
      <div className={`app-content ${maxWidthClassName}`}>
        <header className="app-page-header">
          <div className="min-w-0">
            {eyebrow ? <p className="app-theme-muted mb-1 text-sm">{eyebrow}</p> : null}
            <h1>{title}</h1>
            {subtitle ? <p className="app-theme-muted mt-1 max-w-3xl text-sm">{subtitle}</p> : null}
          </div>
          {headerChildren ? <div className="app-page-actions">{headerChildren}</div> : null}
        </header>
        <div className="app-page-body">{children}</div>
      </div>
    </main>
  );
}
