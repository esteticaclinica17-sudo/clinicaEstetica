import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import type { PaletteMode } from "@mui/material";
import getTheme from "../../assets/styles/theme";
import { readStoredPaletteMode, writeStoredPaletteMode } from "../../util/themeStorage";

type ThemeModeContextValue = {
  mode: PaletteMode;
  setMode: (mode: PaletteMode) => void;
  toggleMode: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used within ThemeModeProvider");
  }
  return ctx;
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PaletteMode>(() => readStoredPaletteMode());

  const setMode = useCallback((next: PaletteMode) => {
    setModeState(next);
    writeStoredPaletteMode(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "light" ? "dark" : "light";
      writeStoredPaletteMode(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ mode, setMode, toggleMode }),
    [mode, setMode, toggleMode]
  );

  const theme = useMemo(() => getTheme(mode), [mode]);

  return (
    <ThemeModeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ThemeModeContext.Provider>
  );
}
