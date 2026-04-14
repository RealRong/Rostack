import type { CSSProperties } from 'react'
import {
  UI_OPTION_COLOR_IDS,
  type UiCardSurfaceState,
  type UiNeutralCardSurfaceTone,
  type UiOptionColorId,
  type UiOptionColorTokenUsage
} from '@shared/ui/color/types'

const OPTION_COLOR_ID_SET = new Set<UiOptionColorId>(UI_OPTION_COLOR_IDS)

const OPTION_COLOR_TOKEN_SUFFIX: Record<UiOptionColorTokenUsage, string> = {
  'badge-bg': 'bg-strong',
  'badge-text': 'text',
  'badge-border': 'border',
  'column-bg': 'bg-soft',
  'column-border': 'border-muted',
  'bg-card': 'bg-card',
  'card-border': 'border-alpha-muted',
  'bg-card-hover': 'bg-card-hover',
  'bg-card-pressed': 'bg-card-pressed',
  'dot-bg': 'bg-strong',
  'status-dot': 'text-secondary',
  surface: 'surface',
  'surface-hover': 'surface-hover',
  'surface-pressed': 'surface-pressed',
  text: 'text',
  'text-secondary': 'text-secondary',
  'text-muted': 'text-muted',
  'icon-secondary': 'icon-secondary'
}

const CARD_STATE_USAGE: Record<UiCardSurfaceState, UiOptionColorTokenUsage> = {
  default: 'bg-card',
  hover: 'bg-card-hover',
  pressed: 'bg-card-pressed'
}

const SURFACE_STATE_USAGE: Record<UiCardSurfaceState, UiOptionColorTokenUsage> = {
  default: 'surface',
  hover: 'surface-hover',
  pressed: 'surface-pressed'
}

const NEUTRAL_CARD_BACKGROUND_TOKEN: Record<UiNeutralCardSurfaceTone, Record<UiCardSurfaceState, string>> = {
  solid: {
    default: 'var(--ui-bg-card)',
    hover: 'var(--ui-bg-card-hover)',
    pressed: 'var(--ui-bg-card-pressed)'
  },
  preview: {
    default: 'var(--ui-bg-card-preview)',
    hover: 'var(--ui-bg-card-hover)',
    pressed: 'var(--ui-bg-card-pressed)'
  }
}

export const normalizeOptionColorId = (
  value?: string | null
): UiOptionColorId => {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase()
    : ''

  return OPTION_COLOR_ID_SET.has(normalized as UiOptionColorId)
    ? normalized as UiOptionColorId
    : 'default'
}

export const resolveOptionColorToken = (
  color: string | null | undefined,
  usage: UiOptionColorTokenUsage
) => `var(--ui-${normalizeOptionColorId(color)}-${OPTION_COLOR_TOKEN_SUFFIX[usage]})`

export const resolveOptionBadgeStyle = (
  color: string | null | undefined
): CSSProperties => ({
  backgroundColor: resolveOptionColorToken(color, 'badge-bg'),
  color: resolveOptionColorToken(color, 'badge-text')
})

export const resolveOptionDotStyle = (
  color: string | null | undefined
): CSSProperties => ({
  backgroundColor: resolveOptionColorToken(color, 'dot-bg')
})

export const resolveOptionStatusDotStyle = (
  color: string | null | undefined
): CSSProperties => ({
  backgroundColor: resolveOptionColorToken(color, 'status-dot')
})

export const resolveOptionColumnStyle = (
  color: string | null | undefined
): CSSProperties => ({
  backgroundColor: resolveOptionColorToken(color, 'column-bg')
})

export const resolveOptionCardStyle = (
  color: string | null | undefined,
  state: UiCardSurfaceState = 'default'
): CSSProperties => ({
  backgroundColor: resolveOptionColorToken(color, CARD_STATE_USAGE[state]),
  boxShadow: `var(--ui-shadow-sm), 0 0 0 1px ${resolveOptionColorToken(color, 'card-border')}`
})

export const resolveOptionSurfaceStyle = (
  color: string | null | undefined,
  state: UiCardSurfaceState = 'default'
): CSSProperties => ({
  backgroundColor: resolveOptionColorToken(color, SURFACE_STATE_USAGE[state])
})

export const resolveNeutralCardStyle = (
  state: UiCardSurfaceState = 'default',
  tone: UiNeutralCardSurfaceTone = 'solid'
): CSSProperties => ({
  backgroundColor: NEUTRAL_CARD_BACKGROUND_TOKEN[tone][state],
  boxShadow: 'var(--ui-shadow-sm), 0 0 0 1px var(--ui-border-alpha-muted)'
})
