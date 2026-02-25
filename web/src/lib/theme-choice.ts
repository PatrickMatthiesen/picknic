export type ThemeChoice = "system" | "light" | "dark";

export const THEME_CHOICES: ThemeChoice[] = ["system", "light", "dark"];

const THEME_STORAGE_KEY = "picknic-ui-theme";

export function getInitialThemeChoice(): ThemeChoice {
    if (typeof window === "undefined") {
        return "system";
    }

    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
        return saved;
    }

    return "system";
}

export function applyThemeChoice(theme: ThemeChoice) {
    if (typeof document === "undefined") {
        return;
    }

    if (theme === "system") {
        document.documentElement.removeAttribute("data-theme");
        return;
    }

    document.documentElement.setAttribute("data-theme", theme);
}

export function persistThemeChoice(theme: ThemeChoice) {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function isDarkThemeChoice(theme: ThemeChoice): boolean {
    if (theme === "dark") {
        return true;
    }

    if (theme === "light") {
        return false;
    }

    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
