export type ColorMode = 'light' | 'dark';

export type ThemePalette = 'forest' | 'ocean' | 'ember' | 'noir';

export interface ThemePaletteConfig {
  id: ThemePalette;
  label: string;
  swatch: string;
  description: string;
}

/** Accent palettes — RGB channel triples for Tailwind alpha support. */
export const THEME_PALETTES: Record<ThemePalette, ThemePaletteConfig> = {
  forest: {
    id: 'forest',
    label: 'Forest',
    swatch: '#059669',
    description: 'Emerald mission green',
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    swatch: '#0284c7',
    description: 'Deep sea blue',
  },
  ember: {
    id: 'ember',
    label: 'Ember',
    swatch: '#ea580c',
    description: 'Copper heat',
  },
  noir: {
    id: 'noir',
    label: 'Noir',
    swatch: '#84cc16',
    description: 'Chartreuse on charcoal',
  },
};

export const THEME_PALETTE_IDS = Object.keys(THEME_PALETTES) as ThemePalette[];

const PALETTE_VARS: Record<ThemePalette, Record<string, string>> = {
  forest: {
    '--brand-50': '236 253 245',
    '--brand-100': '209 250 229',
    '--brand-200': '167 243 208',
    '--brand-300': '110 231 183',
    '--brand-400': '52 211 153',
    '--brand-500': '16 185 129',
    '--brand-600': '5 150 105',
    '--brand-700': '4 120 87',
    '--brand-800': '6 95 70',
    '--brand-900': '6 78 59',
    '--app-bg-light': 'linear-gradient(160deg, #f8fafc 0%, #ecfdf5 45%, #f1f5f9 100%)',
    '--app-bg-dark': 'linear-gradient(160deg, #020617 0%, #052e1f 50%, #0f172a 100%)',
  },
  ocean: {
    '--brand-50': '240 249 255',
    '--brand-100': '224 242 254',
    '--brand-200': '186 230 253',
    '--brand-300': '125 211 252',
    '--brand-400': '56 189 248',
    '--brand-500': '14 165 233',
    '--brand-600': '2 132 199',
    '--brand-700': '3 105 161',
    '--brand-800': '7 89 133',
    '--brand-900': '12 74 110',
    '--app-bg-light': 'linear-gradient(160deg, #f8fafc 0%, #e0f2fe 42%, #f1f5f9 100%)',
    '--app-bg-dark': 'linear-gradient(160deg, #020617 0%, #0c4a6e 48%, #0f172a 100%)',
  },
  ember: {
    '--brand-50': '255 247 237',
    '--brand-100': '255 237 213',
    '--brand-200': '254 215 170',
    '--brand-300': '253 186 116',
    '--brand-400': '251 146 60',
    '--brand-500': '249 115 22',
    '--brand-600': '234 88 12',
    '--brand-700': '194 65 12',
    '--brand-800': '154 52 18',
    '--brand-900': '124 45 18',
    '--app-bg-light': 'linear-gradient(160deg, #fafaf9 0%, #ffedd5 40%, #f5f5f4 100%)',
    '--app-bg-dark': 'linear-gradient(160deg, #0c0a09 0%, #431407 45%, #1c1917 100%)',
  },
  noir: {
    '--brand-50': '247 254 231',
    '--brand-100': '236 252 203',
    '--brand-200': '217 249 157',
    '--brand-300': '190 242 100',
    '--brand-400': '163 230 53',
    '--brand-500': '132 204 22',
    '--brand-600': '101 163 13',
    '--brand-700': '77 124 15',
    '--brand-800': '63 98 18',
    '--brand-900': '54 83 20',
    '--app-bg-light': 'linear-gradient(160deg, #fafafa 0%, #f7fee7 38%, #f4f4f5 100%)',
    '--app-bg-dark': 'linear-gradient(165deg, #09090b 0%, #14532d33 40%, #18181b 100%)',
  },
};

export function applyTheme(palette: ThemePalette, mode: ColorMode) {
  const root = document.documentElement;
  const vars = PALETTE_VARS[palette];
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  root.dataset.palette = palette;
  root.classList.toggle('dark', mode === 'dark');
  root.style.setProperty('--app-bg', mode === 'dark' ? vars['--app-bg-dark'] : vars['--app-bg-light']);
}

export function loadStoredPalette(): ThemePalette {
  const saved = localStorage.getItem('theme_palette');
  if (saved && saved in THEME_PALETTES) return saved as ThemePalette;
  return 'forest';
}

export function loadStoredMode(): ColorMode {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
