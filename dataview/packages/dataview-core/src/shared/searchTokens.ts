import {
  trimLowercase
} from '@shared/core'

const EMPTY_TOKENS = [] as const

export const SEARCH_TOKEN_SEPARATOR = '\u0000'

export const normalizeToken = (
  value: unknown
): string | undefined => trimLowercase(value)

export const appendTokens = (
  target: Set<string>,
  values: readonly string[]
) => {
  for (let index = 0; index < values.length; index += 1) {
    const token = normalizeToken(values[index]!)
    if (token) {
      target.add(token)
    }
  }
}

export const normalizeTokens = (
  values: readonly string[]
): readonly string[] => {
  if (!values.length) {
    return EMPTY_TOKENS
  }

  const tokens = new Set<string>()
  appendTokens(tokens, values)
  return tokens.size
    ? Array.from(tokens)
    : EMPTY_TOKENS
}

export const joinTokens = (
  values: readonly string[]
): string | undefined => {
  const tokens = normalizeTokens(values)
  return tokens.length
    ? tokens.join(SEARCH_TOKEN_SEPARATOR)
    : undefined
}

export const splitJoinedTokens = (
  value: string | undefined
): readonly string[] => value
  ? value.split(SEARCH_TOKEN_SEPARATOR).filter(Boolean)
  : EMPTY_TOKENS
