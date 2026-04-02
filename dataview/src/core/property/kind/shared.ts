export type PropertyDraftParseResult =
  | { type: 'set'; value: unknown }
  | { type: 'clear' }
  | { type: 'invalid' }

const BOOLEAN_TRUE = new Set(['true', '1', 'yes', 'y', 'checked', 'on'])
const BOOLEAN_FALSE = new Set(['false', '0', 'no', 'n', 'unchecked', 'off'])

export const normalizeSearchableValue = (value: unknown): string[] => {
  if (value === undefined || value === null) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => normalizeSearchableValue(item))
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(item => normalizeSearchableValue(item))
  }

  return [String(value)]
}

export const normalizePropertyToken = (value: unknown) => String(value).trim().toLowerCase()

const normalizeNumericDraftChar = (value: string) => {
  if (value >= '0' && value <= '9') {
    return value
  }

  switch (value) {
    case '０':
      return '0'
    case '１':
      return '1'
    case '２':
      return '2'
    case '３':
      return '3'
    case '４':
      return '4'
    case '５':
      return '5'
    case '６':
      return '6'
    case '７':
      return '7'
    case '８':
      return '8'
    case '９':
      return '9'
    case '.':
    case '．':
    case '。':
      return '.'
    case '+':
    case '＋':
      return '+'
    case '-':
    case '－':
    case '−':
      return '-'
    case ',':
    case '，':
      return ','
    default:
      return undefined
  }
}

export const readLooseNumberDraft = (value: string): number | undefined => {
  const draft = value.trim()
  if (!draft) {
    return undefined
  }

  let sign = ''
  let integerDigits = ''
  let fractionDigits = ''
  let hasDigits = false
  let hasDecimal = false

  for (const rawChar of draft) {
    const char = normalizeNumericDraftChar(rawChar)
    if (!char) {
      continue
    }

    if ((char === '+' || char === '-') && !sign && !hasDigits && !hasDecimal) {
      sign = char === '-' ? '-' : ''
      continue
    }

    if (char >= '0' && char <= '9') {
      hasDigits = true

      if (hasDecimal) {
        fractionDigits += char
      } else {
        integerDigits += char
      }

      continue
    }

    if (char === '.' && !hasDecimal) {
      hasDecimal = true
      continue
    }

    if (char === ',') {
      continue
    }
  }

  if (!hasDigits) {
    return undefined
  }

  const normalized = `${sign}${integerDigits || (hasDecimal ? '0' : '')}${hasDecimal ? `.${fractionDigits}` : ''}`
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const readBooleanValue = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = normalizePropertyToken(value)
  if (BOOLEAN_TRUE.has(normalized)) {
    return true
  }
  if (BOOLEAN_FALSE.has(normalized)) {
    return false
  }
  return undefined
}

export const readNumberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

export const isEmptyPropertyValue = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return true
  }

  if (typeof value === 'string') {
    return !value.trim()
  }

  if (Array.isArray(value)) {
    return value.length === 0
  }

  return false
}
