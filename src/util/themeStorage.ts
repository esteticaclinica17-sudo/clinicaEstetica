import type { PaletteMode } from "@mui/material";

const STORAGE_KEY = "concept-clinic-palette-mode";

export function readStoredPaletteMode(): PaletteMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    /* ignore */
  }
  return "light";
}

export function writeStoredPaletteMode(mode: PaletteMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
