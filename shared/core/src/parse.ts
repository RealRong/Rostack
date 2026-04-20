import {
  trimLowercase,
  trimToUndefined
} from './string'

const BOOLEAN_TRUE = new Set(['true', '1', 'yes', 'y', 'checked', 'on'])
const BOOLEAN_FALSE = new Set(['false', '0', 'no', 'n', 'unchecked', 'off'])

const normalizeNumericDraftChar = (
  value: string
) => {
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

export const readFiniteNumber = (
  value: unknown
): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const normalized = trimToUndefined(value)
  if (!normalized) {
    return undefined
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed)
    ? parsed
    : undefined
}

export const readLooseNumber = (
  value: string
): number | undefined => {
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
  return Number.isFinite(parsed)
    ? parsed
    : undefined
}

export const readBooleanLike = (
  value: unknown
): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value
  }

  const normalized = trimLowercase(value)
  if (!normalized) {
    return undefined
  }

  if (BOOLEAN_TRUE.has(normalized)) {
    return true
  }
  if (BOOLEAN_FALSE.has(normalized)) {
    return false
  }

  return undefined
}
