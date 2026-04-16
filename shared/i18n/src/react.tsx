import {
  createInstance,
  type Resource
} from 'i18next'
import {
  createElement,
  type ReactNode,
  useEffect,
  useMemo
} from 'react'
import {
  I18nextProvider,
  initReactI18next,
  useTranslation as useI18nextTranslation
} from 'react-i18next'
import {
  isDateToken,
  isRangeToken,
  isRefToken,
  isTranslationToken,
  readTokenResolver,
  type DateToken,
  type Token,
  type TokenResolverContext
} from '@shared/i18n'

const DEFAULT_LANGUAGE = 'en'

const parseDateLike = (
  value: DateToken['date']
) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? undefined
      : value
  }

  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime())
      ? undefined
      : parsed
  }

  if (value && typeof value === 'object' && typeof value.start === 'string') {
    const parsed = new Date(`${value.start.slice(0, 10)}T00:00:00`)
    return Number.isNaN(parsed.getTime())
      ? undefined
      : parsed
  }

  return undefined
}

const DEFAULT_INSTANCE = createInstance()
void DEFAULT_INSTANCE
  .use(initReactI18next)
  .init({
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    resources: {},
    interpolation: {
      escapeValue: false
    }
  })

export interface I18nProviderProps {
  children: ReactNode
  lang?: string
  resources?: Resource
}

export const I18nProvider = (props: I18nProviderProps) => {
  const instance = useMemo(() => {
    const next = createInstance()
    void next
      .use(initReactI18next)
      .init({
        lng: props.lang ?? DEFAULT_LANGUAGE,
        fallbackLng: DEFAULT_LANGUAGE,
        resources: props.resources ?? {},
        interpolation: {
          escapeValue: false
        }
      })
    return next
  }, [props.lang, props.resources])

  useEffect(() => {
    void instance.changeLanguage(props.lang ?? DEFAULT_LANGUAGE)
  }, [instance, props.lang])

  return createElement(I18nextProvider, {
    i18n: instance,
    children: props.children
  })
}

export const useTranslation = () => {
  const {
    t: rawT,
    i18n,
    ...rest
  } = useI18nextTranslation()

  const language = i18n.language || DEFAULT_LANGUAGE

  const formatNumber = (
    value: number,
    options?: Intl.NumberFormatOptions
  ) => new Intl.NumberFormat(language, options).format(value)

  const formatPercent = (
    value: number,
    options?: Intl.NumberFormatOptions
  ) => new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 1,
    ...options
  }).format(value)

  const formatDate = (
    value: DateToken['date'],
    options?: Intl.DateTimeFormatOptions
  ) => {
    const parsed = parseDateLike(value)
    if (!parsed) {
      if (typeof value === 'string') {
        return value
      }

      if (
        value
        && typeof value === 'object'
        && !(value instanceof Date)
        && typeof value.start === 'string'
      ) {
        return value.start
      }

      return ''
    }

    return new Intl.DateTimeFormat(language, options ?? {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(parsed)
  }

  const formatList = (
    items: readonly string[]
  ) => items.length <= 1
    ? items[0] ?? ''
    : new Intl.ListFormat(language, {
        style: 'short',
        type: 'conjunction'
      }).format(items)

  const t = (
    value: Token
  ): string => {
    const context: TokenResolverContext = {
      language,
      t,
      formatNumber,
      formatPercent,
      formatDate,
      formatList
    }

    if (typeof value === 'string') {
      return value
    }

    if (typeof value === 'number') {
      return formatNumber(value)
    }

    if (typeof value === 'boolean') {
      return rawT(
        value ? 'shared.i18n.boolean.true' : 'shared.i18n.boolean.false',
        {
          defaultValue: value ? 'True' : 'False'
        }
      )
    }

    if (Array.isArray(value)) {
      return formatList(value.map(item => t(item)))
    }

    if (isTranslationToken(value)) {
      const resolvedValues = Object.fromEntries(Object.entries(value.values ?? {}).map(([key, entry]) => [
        key,
        isTranslationToken(entry)
          || isRefToken(entry)
          || isRangeToken(entry)
          || isDateToken(entry)
          || Array.isArray(entry)
          || typeof entry === 'string'
          || typeof entry === 'number'
          || typeof entry === 'boolean'
          ? t(entry as Token)
          : entry
      ]))
      return rawT(value.key, {
        defaultValue: value.fallback,
        ...resolvedValues
      })
    }

    if (isRefToken(value)) {
      const resolver = readTokenResolver(value.ref)
      const next = resolver?.(value, context)
      if (next !== undefined) {
        return t(next)
      }

      return value.id ?? ''
    }

    if (isDateToken(value)) {
      return formatDate(value.date)
    }

    if (isRangeToken(value)) {
      const min = value.min === undefined ? '' : t(value.min)
      const max = value.max === undefined ? '' : t(value.max)
      if (!min && !max) {
        return ''
      }
      if (!min) {
        return max
      }
      if (!max) {
        return min
      }
      return `${min} - ${max}`
    }

    return ''
  }

  return {
    ...rest,
    i18n,
    t,
    formatNumber,
    formatPercent,
    formatDate,
    formatList
  }
}
