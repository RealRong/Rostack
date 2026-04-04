import type { CSSProperties } from 'react'
import {
  UI_OPTION_COLOR_IDS,
  type UiOptionColorId,
  type UiOptionColorTokenUsage
} from './types'

const OPTION_COLOR_ID_SET = new Set<UiOptionColorId>(UI_OPTION_COLOR_IDS)

const OPTION_COLOR_TOKEN_SUFFIX: Record<UiOptionColorTokenUsage, string> = {
  'badge-bg': 'bg-strong',
  'badge-text': 'text',
  'badge-border': 'border',
  'column-bg': 'bg-soft',
  'column-border': 'border-muted',
  'card-bg': 'card-bg',
  'card-bg-hover': 'card-bg-hover',
  'card-bg-pressed': 'card-bg-pressed',
  'dot-bg': 'bg-strong',
  text: 'text',
  'text-muted': 'text-muted'
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

export const resolveOptionColumnStyle = (
  color: string | null | undefined
): CSSProperties => ({
  backgroundColor: resolveOptionColorToken(color, 'column-bg')
})

export const resolveOptionCardStyle = (
  color: string | null | undefined
): CSSProperties => ({
  backgroundColor: resolveOptionColorToken(color, 'card-bg')
})
