import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

type Theme = "light";

const ThemeContext = createContext<{
  theme: Theme;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "light";
    root.classList.remove("dark");
    localStorage.removeItem("marksmith-theme");
  }, []);

  const value = useMemo(() => ({ theme: "light" as Theme }), []);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
