export const VIEWPORT_THEME_COLORS = [
  { media: '(prefers-color-scheme: light)', color: 'oklch(0.978 0.006 205)' },
  { media: '(prefers-color-scheme: dark)', color: 'oklch(0.16 0.01 238)' },
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
