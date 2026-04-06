import type { CustomField, UrlField } from '../../contracts/state'

export type UrlPropertyConfig = Pick<UrlField, 'displayFullUrl'>
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
  displayFullUrl: false
})

export const getUrlPropertyConfig = (
  property: CustomField | undefined
): ResolvedUrlPropertyConfig => (
  property?.kind === 'url'
    ? {
        ...createDefaultUrlPropertyConfig(),
        displayFullUrl: property.displayFullUrl === true
      }
    : createDefaultUrlPropertyConfig()
)

export const formatUrlDisplayValue = (
  property: CustomField | undefined,
  value: unknown
) => {
  const raw = String(value)
  const config = getUrlPropertyConfig(property)

  if (config.displayFullUrl) {
    return raw
  }

  return readCompactUrlDisplay(raw) ?? raw
}
