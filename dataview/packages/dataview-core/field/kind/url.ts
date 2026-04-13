import type { CustomField, UrlField } from '../../contracts/state'

export type UrlFieldConfig = Pick<UrlField, 'displayFullUrl'>
export interface ResolvedUrlFieldConfig extends UrlFieldConfig {
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

export const createDefaultUrlFieldConfig = (): ResolvedUrlFieldConfig => ({
  displayFullUrl: false
})

export const getUrlFieldConfig = (
  field: CustomField | undefined
): ResolvedUrlFieldConfig => (
  field?.kind === 'url'
    ? {
        ...createDefaultUrlFieldConfig(),
        displayFullUrl: field.displayFullUrl === true
      }
    : createDefaultUrlFieldConfig()
)

export const formatUrlDisplayValue = (
  field: CustomField | undefined,
  value: unknown
) => {
  const raw = String(value)
  const config = getUrlFieldConfig(field)

  if (config.displayFullUrl) {
    return raw
  }

  return readCompactUrlDisplay(raw) ?? raw
}
