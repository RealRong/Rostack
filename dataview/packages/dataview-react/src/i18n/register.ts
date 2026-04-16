import {
  registerTokenResolver,
  type RefToken,
  type Token,
  type TokenResolverContext
} from '@shared/i18n'
import { meta } from '@dataview/meta'

let initialized = false

const formatDateBucket = (
  token: RefToken,
  context: TokenResolverContext
): string => {
  const payload = token.payload
  if (!payload || typeof payload !== 'object') {
    return token.id ?? ''
  }

  const mode = typeof (payload as {
    mode?: unknown
  }).mode === 'string'
    ? (payload as {
        mode: string
      }).mode
    : 'day'
  const start = typeof (payload as {
    start?: unknown
  }).start === 'string'
    ? (payload as {
        start: string
      }).start
    : ''

  if (!start) {
    return ''
  }

  switch (mode) {
    case 'year':
      return context.formatDate(start, {
        year: 'numeric'
      })
    case 'month':
      return context.formatDate(start, {
        month: 'long',
        year: 'numeric'
      })
    case 'quarter': {
      const parsed = new Date(`${start}T00:00:00`)
      if (Number.isNaN(parsed.getTime())) {
        return start
      }
      return `Q${Math.floor(parsed.getMonth() / 3) + 1} ${parsed.getFullYear()}`
    }
    case 'week':
    case 'day':
    default:
      return context.formatDate(start, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
  }
}

export const ensureDataviewTokenResolvers = () => {
  if (initialized) {
    return
  }

  initialized = true

  registerTokenResolver('dataview.systemValue', (token): Token => (
    meta.systemValue.get(token.id).token
  ))

  registerTokenResolver('dataview.statusCategory', (token): Token => (
    meta.status.category.get(token.id).token
  ))

  registerTokenResolver('dataview.dateBucket', (token, context): Token => (
    formatDateBucket(token, context)
  ))
}
