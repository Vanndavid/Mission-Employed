import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { applyTheme, ColorMode, loadStoredMode, loadStoredPalette, ThemePalette } from '../themes';

/**
 * The colour theme and light/dark mode.
 *
 * Held here rather than in App so the Settings page can change them without
 * the shell threading setters through every route. Theme is a device
 * preference, not account data, so it stays in localStorage.
 */

interface ThemeValue {
  mode: ColorMode;
  palette: ThemePalette;
  setMode: (mode: ColorMode) => void;
  setPalette: (palette: ThemePalette) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(() => loadStoredMode());
  const [palette, setPalette] = useState<ThemePalette>(() => loadStoredPalette());

  useEffect(() => {
    try {
      localStorage.setItem('theme', mode);
      localStorage.setItem('theme_palette', palette);
    } catch {
      // A blocked localStorage costs remembering the choice, not applying it.
    }
    applyTheme(palette, mode);
  }, [mode, palette]);

  const value = useMemo(() => ({ mode, palette, setMode, setPalette }), [mode, palette]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
