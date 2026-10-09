export const DESIGN_TOKENS = {
  color: {
    brand: {
      base: 'oklch(0.55 0.15 160)',
      strong: 'oklch(0.48 0.18 160)',
      subtle: 'oklch(0.95 0.02 160)',
    },
    semantic: {
      success: 'oklch(0.62 0.15 150)',
      warning: 'oklch(0.72 0.14 85)',
      danger: 'oklch(0.58 0.22 25)',
      info: 'oklch(0.58 0.15 240)',
    },
    surface: {
      1: 'oklch(1 0 0)',
      2: 'oklch(0.98 0.003 240)',
      3: 'oklch(0.95 0.005 240)',
    },
    border: {
      subtle: 'oklch(0.9 0.005 240)',
      default: 'oklch(0.87 0.008 240)',
    },
  },
  spacing: {
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
    10: '2.5rem',
    12: '3rem',
    16: '4rem',
  },
  radius: {
    'xs': '0.25rem',
    'sm': '0.375rem',
    'md': '0.5rem',
    'lg': '0.75rem',
    'xl': '1rem',
    '2xl': '1.5rem',
    'full': '9999px',
  },
  shadow: {
    xs: '0 1px 2px oklch(0 0 0 / 0.03)',
    sm: '0 1px 3px oklch(0 0 0 / 0.05), 0 1px 2px oklch(0 0 0 / 0.03)',
    md: '0 4px 12px oklch(0 0 0 / 0.06), 0 2px 4px oklch(0 0 0 / 0.04)',
    lg: '0 12px 28px oklch(0 0 0 / 0.08), 0 4px 8px oklch(0 0 0 / 0.05)',
    xl: '0 20px 40px oklch(0 0 0 / 0.1), 0 8px 16px oklch(0 0 0 / 0.06)',
  },
  motion: {
    easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
    easeOutCirc: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    easeSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    easeStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    durationFast: '120ms',
    durationBase: '200ms',
    durationSlow: '320ms',
    durationSlower: '480ms',
  },
  typography: {
    sans: 'Geist, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
    mono: 'JetBrains Mono, Fira Code, monospace',
  },
} as const

export const VIEWPORT_THEME_COLORS = [
  { media: '(prefers-color-scheme: light)', color: 'oklch(0.985 0.002 160)' },
  { media: '(prefers-color-scheme: dark)', color: 'oklch(0.16 0.006 160)' },
] as const

export const STATUS_TONES = {
  success: {
    surface: 'bg-success/10 border-success/20',
    iconSurface: 'bg-success/10',
    icon: 'text-success',
    dot: 'bg-success',
    badge: 'bg-success/10 text-success',
    inline: 'text-success',
    calloutSurface: 'rounded-lg border border-success/20 bg-success/10',
    calloutText: 'text-success',
  },
  info: {
    surface: 'bg-info/10 border-info/20',
    iconSurface: 'bg-info/10',
    icon: 'text-info',
    dot: 'bg-info',
    badge: 'bg-info/10 text-info',
    inline: 'text-info',
    calloutSurface: 'rounded-lg border border-info/20 bg-info/10',
    calloutText: 'text-info',
  },
  warning: {
    surface: 'bg-warning/10 border-warning/20',
    iconSurface: 'bg-warning/10',
    icon: 'text-warning',
    dot: 'bg-warning',
    badge: 'bg-warning/10 text-warning',
    inline: 'text-warning',
    calloutSurface: 'rounded-lg border border-warning/20 bg-warning/10',
    calloutText: 'text-warning',
  },
  danger: {
    surface: 'bg-destructive/10 border-destructive/20',
    iconSurface: 'bg-destructive/10',
    icon: 'text-destructive',
    dot: 'bg-destructive',
    badge: 'bg-destructive/10 text-destructive',
    inline: 'text-destructive',
    calloutSurface: 'rounded-lg border border-destructive/20 bg-destructive/10',
    calloutText: 'text-destructive',
  },
  neutral: {
    surface: 'bg-muted/50 border-border',
    iconSurface: 'bg-muted',
    icon: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
    inline: 'text-muted-foreground',
    calloutSurface: 'rounded-lg bg-muted/30',
    calloutText: 'text-muted-foreground',
  },
} as const

export const INTERACTIVE_TONES = {
  dangerHover: 'hover:text-destructive',
} as const

export const DEV_ERROR_DETAILS = {
  standard: 'max-h-40 overflow-auto rounded-lg bg-muted p-4 text-xs',
  compact: 'max-h-32 overflow-auto rounded-lg bg-muted p-3 text-xs',
} as const

export type StatusTone = keyof typeof STATUS_TONES
