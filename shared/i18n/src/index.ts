export type TranslationTokenValues = Record<string, unknown>

export interface TranslationToken {
  key: string
  fallback: string
  values?: TranslationTokenValues
}

export interface RefToken {
  ref: string
  id?: string
  payload?: unknown
}

export interface RangeToken {
  min?: Token
  max?: Token
}

export interface DateToken {
  date: Date | string | {
    start: string
  }
}

export type Token =
  | string
  | number
  | boolean
  | readonly Token[]
  | TranslationToken
  | RefToken
  | RangeToken
  | DateToken

export type TokenTranslator = (
  value: Token
) => string

export const token = (
  key: string,
  fallback: string,
  values?: TranslationTokenValues
): TranslationToken => ({
  key,
  fallback,
  values
})

export const tokenRef = (
  ref: string,
  id?: string,
  payload?: unknown
): RefToken => ({
  ref,
  ...(id === undefined ? {} : { id }),
  ...(payload === undefined ? {} : { payload })
})

export const tokenDate = (
  date: DateToken['date']
): DateToken => ({
  date
})

export const tokenRange = (input: {
  min?: Token
  max?: Token
}): RangeToken => ({
  ...(input.min === undefined ? {} : { min: input.min }),
  ...(input.max === undefined ? {} : { max: input.max })
})

export const isTranslationToken = (
  value: unknown
): value is TranslationToken => Boolean(value)
  && typeof value === 'object'
  && typeof (value as {
    key?: unknown
  }).key === 'string'
  && typeof (value as {
    fallback?: unknown
  }).fallback === 'string'

export const isRefToken = (
  value: unknown
): value is RefToken => Boolean(value)
  && typeof value === 'object'
  && typeof (value as {
    ref?: unknown
  }).ref === 'string'

export const isRangeToken = (
  value: unknown
): value is RangeToken => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && !isTranslationToken(value)
  && !isRefToken(value)
  && !isDateToken(value)
  && (
    Object.prototype.hasOwnProperty.call(value, 'min')
    || Object.prototype.hasOwnProperty.call(value, 'max')
  )

export const isDateToken = (
  value: unknown
): value is DateToken => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.prototype.hasOwnProperty.call(value, 'date')

export interface TokenResolverContext {
  readonly language?: string
  t: TokenTranslator
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
  formatPercent: (value: number, options?: Intl.NumberFormatOptions) => string
  formatDate: (value: DateToken['date'], options?: Intl.DateTimeFormatOptions) => string
  formatList: (items: readonly string[]) => string
}

export type TokenResolver = (
  token: RefToken,
  context: TokenResolverContext
) => Token | undefined

const TOKEN_RESOLVERS = new Map<string, TokenResolver>()

export const registerTokenResolver = (
  ref: string,
  resolver: TokenResolver
) => {
  TOKEN_RESOLVERS.set(ref, resolver)
}

export const readTokenResolver = (
  ref: string
): TokenResolver | undefined => TOKEN_RESOLVERS.get(ref)
