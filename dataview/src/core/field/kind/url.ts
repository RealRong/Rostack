import type { GroupProperty, GroupPropertyConfig } from '../../contracts/state'

export type UrlPropertyConfig = Extract<GroupPropertyConfig, { type: 'url' }>
export interface ResolvedUrlPropertyConfig extends UrlPropertyConfig {
  displayFullUrl: boolean
}

const BARE_HOST_RE = /^[^/\s]+\.[^/\s]+(?:[/?#].*)?$/i

const stripCommonSubdomain = (value: string) => (
  value.replace(/^www\./i, '')
)

const readCompactUrlDisplay = (value: string) => {
  const raw = value.trim()
  if (!raw) {
    return ''
  }

  try {
    const parsed = new URL(raw)
    if (parsed.hostname) {
      return stripCommonSubdomain(parsed.hostname)
    }
  } catch {
    if (BARE_HOST_RE.test(raw)) {
      try {
        const parsed = new URL(`https://${raw}`)
        if (parsed.hostname) {
          return stripCommonSubdomain(parsed.hostname)
        }
      } catch {
        return undefined
      }
    }
  }

  return undefined
}

export const createDefaultUrlPropertyConfig = (): ResolvedUrlPropertyConfig => ({
  type: 'url',
  displayFullUrl: false
})

export const getUrlPropertyConfig = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined
): ResolvedUrlPropertyConfig => (
  property?.kind === 'url' && property.config?.type === 'url'
    ? {
        ...createDefaultUrlPropertyConfig(),
        ...property.config
      }
    : createDefaultUrlPropertyConfig()
)

export const formatUrlDisplayValue = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  value: unknown
) => {
  const raw = String(value)
  const config = getUrlPropertyConfig(property)

  if (config.displayFullUrl) {
    return raw
  }

  return readCompactUrlDisplay(raw) ?? raw
}
