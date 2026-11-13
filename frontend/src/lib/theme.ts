export type ThemeName = 'lavender' | 'mint' | 'rose' | 'sky' | 'peach'

export type Theme = {
  name: ThemeName
  /** Header band background (gradient). Text on it is always text-ink. */
  band: string
  /** Light tinted surface, e.g. summary panels. */
  soft: string
  softBorder: string
  /** Quick-action tile: background + text colour. */
  tile: string
  /** Accent text colour (links, small labels). */
  text: string
  /** Filled CTA background (white text on top). */
  accentBtn: string
  /** Active bottom-nav pill. */
  navActive: string
  /** Solid dot / avatar background. */
  dot: string
  /** Group card background on Home. */
  card: string
  /** Decorative blob colour. */
  blob: string
}

export const THEMES: Record<ThemeName, Theme> = {
  lavender: {
    name: 'lavender',
    band: 'bg-gradient-to-br from-pastel-lavender via-violet-200 to-pastel-rose/70',
    soft: 'bg-violet-50',
    softBorder: 'border-violet-100',
    tile: 'bg-violet-100 text-violet-700',
    text: 'text-violet-600',
    accentBtn: 'bg-gradient-to-br from-pastel-purple to-pastel-purple-deep shadow-[0_8px_20px_rgba(139,92,246,0.30)]',
    navActive: 'bg-violet-100 text-violet-700',
    dot: 'bg-pastel-purple',
    card: 'bg-violet-100',
    blob: 'bg-pastel-lavender',
  },
  mint: {
    name: 'mint',
    band: 'bg-gradient-to-br from-pastel-mint via-emerald-200 to-teal-100',
    soft: 'bg-emerald-50',
    softBorder: 'border-emerald-100',
    tile: 'bg-emerald-100 text-emerald-700',
    text: 'text-emerald-600',
    accentBtn: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-[0_8px_20px_rgba(16,185,129,0.28)]',
    navActive: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-pastel-mint-deep',
    card: 'bg-emerald-100',
    blob: 'bg-pastel-mint',
  },
  rose: {
    name: 'rose',
    band: 'bg-gradient-to-br from-pastel-rose via-rose-200 to-orange-100',
    soft: 'bg-rose-50',
    softBorder: 'border-rose-100',
    tile: 'bg-rose-100 text-rose-700',
    text: 'text-rose-600',
    accentBtn: 'bg-gradient-to-br from-rose-500 to-rose-600 shadow-[0_8px_20px_rgba(244,63,94,0.28)]',
    navActive: 'bg-rose-100 text-rose-700',
    dot: 'bg-pastel-rose-deep',
    card: 'bg-rose-100',
    blob: 'bg-pastel-rose',
  },
  sky: {
    name: 'sky',
    band: 'bg-gradient-to-br from-pastel-sky via-sky-200 to-indigo-100',
    soft: 'bg-sky-50',
    softBorder: 'border-sky-100',
    tile: 'bg-sky-100 text-sky-700',
    text: 'text-sky-600',
    accentBtn: 'bg-gradient-to-br from-sky-500 to-sky-600 shadow-[0_8px_20px_rgba(14,165,233,0.28)]',
    navActive: 'bg-sky-100 text-sky-700',
    dot: 'bg-sky-400',
    card: 'bg-sky-100',
    blob: 'bg-pastel-sky',
  },
  peach: {
    name: 'peach',
    band: 'bg-gradient-to-br from-pastel-peach via-orange-200 to-pastel-rose/70',
    soft: 'bg-orange-50',
    softBorder: 'border-orange-100',
    tile: 'bg-orange-100 text-orange-700',
    text: 'text-orange-600',
    accentBtn: 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-[0_8px_20px_rgba(249,115,22,0.28)]',
    navActive: 'bg-orange-100 text-orange-700',
    dot: 'bg-pastel-peach',
    card: 'bg-orange-100',
    blob: 'bg-pastel-peach',
  },
}

const ORDER: ThemeName[] = ['lavender', 'mint', 'rose', 'sky', 'peach']

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

export function groupTheme(groupId: string): Theme {
  return THEMES[ORDER[hashString(groupId) % ORDER.length]]
}

export const TAB_THEMES = {
  home: THEMES.lavender,
  history: THEMES.rose,
  add: THEMES.sky,
  profile: THEMES.peach,
} as const

const AVATAR_COLORS = ['bg-pastel-purple', 'bg-pastel-mint-deep', 'bg-pastel-rose-deep', 'bg-sky-400', 'bg-pastel-peach']

export function avatarColor(id: string): string {
  return AVATAR_COLORS[hashString(id) % AVATAR_COLORS.length]
}
