import { TZDateMini } from '@date-fns/tz'
import {
  differenceInCalendarDays,
  format,
  isValid,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear
} from 'date-fns'
import type {
  DateValue,
  DateField,
  CustomField,
  DateDisplayFormat,
  DateValueKind,
  TimeDisplayFormat
} from '@dataview/core/contracts/state'

export type DateFieldConfig = Pick<DateField, 'displayDateFormat' | 'displayTimeFormat' | 'defaultValueKind' | 'defaultTimezone'>
export type DateGroupMode = 'day' | 'week' | 'month' | 'quarter' | 'year'

export const DATE_VALUE_KINDS = ['date', 'datetime'] as const satisfies readonly DateValueKind[]
export const DATE_DISPLAY_FORMATS = ['full', 'short', 'mdy', 'dmy', 'ymd', 'relative'] as const satisfies readonly DateDisplayFormat[]
export const DATE_TIME_FORMATS = ['12h', '24h'] as const satisfies readonly TimeDisplayFormat[]
export const DATE_GROUP_MODES = ['day', 'week', 'month', 'quarter', 'year'] as const satisfies readonly DateGroupMode[]

const DATE_ONLY_FORMAT = 'yyyy-MM-dd'
const DATE_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm"
const DATE_TIME_DRAFT_FORMAT = 'yyyy-MM-dd HH:mm'
const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles'
] as const

interface DateOnlyParts {
  year: number
  month: number
  day: number
}

interface DateTimeParts extends DateOnlyParts {
  hour: number
  minute: number
}

type DateLike = Date

const pad2 = (value: number) => String(value).padStart(2, '0')
const isDigitCode = (code: number) => code >= 48 && code <= 57
const read2Digits = (value: string, offset: number) => {
  const left = value.charCodeAt(offset)
  const right = value.charCodeAt(offset + 1)
  if (!isDigitCode(left) || !isDigitCode(right)) {
    return undefined
  }

  return ((left - 48) * 10) + (right - 48)
}

const read4Digits = (value: string, offset: number) => {
  const a = value.charCodeAt(offset)
  const b = value.charCodeAt(offset + 1)
  const c = value.charCodeAt(offset + 2)
  const d = value.charCodeAt(offset + 3)
  if (!isDigitCode(a) || !isDigitCode(b) || !isDigitCode(c) || !isDigitCode(d)) {
    return undefined
  }

  return (
    ((a - 48) * 1000)
    + ((b - 48) * 100)
    + ((c - 48) * 10)
    + (d - 48)
  )
}

const isLeapYear = (year: number) => (
  year % 4 === 0
  && (year % 100 !== 0 || year % 400 === 0)
)

const daysInMonth = (year: number, month: number) => {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

const toDateOnlyString = (parts: DateOnlyParts) => (
  `${String(parts.year).padStart(4, '0')}-${pad2(parts.month)}-${pad2(parts.day)}`
)

const toDateTimeString = (parts: DateTimeParts) => (
  `${toDateOnlyString(parts)}T${pad2(parts.hour)}:${pad2(parts.minute)}`
)

const readDateOnlyParts = (
  value: Date
): DateOnlyParts => ({
  year: value.getFullYear(),
  month: value.getMonth() + 1,
  day: value.getDate()
})

const readDateTimeParts = (
  value: Date
): DateTimeParts => ({
  ...readDateOnlyParts(value),
  hour: value.getHours(),
  minute: value.getMinutes()
})

const parseDateOnlyPartsExact = (
  value: string
): DateOnlyParts | undefined => {
  if (value.length !== 10 || value.charCodeAt(4) !== 45 || value.charCodeAt(7) !== 45) {
    return undefined
  }

  const year = read4Digits(value, 0)
  const month = read2Digits(value, 5)
  const day = read2Digits(value, 8)
  if (
    year === undefined
    || month === undefined
    || day === undefined
    || month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
  ) {
    return undefined
  }

  return {
    year,
    month,
    day
  }
}

const parseDateOnly = (value: string): DateOnlyParts | undefined => {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  return parseDateOnlyPartsExact(trimmed)
}

const parseDateTime = (value: string): DateTimeParts | undefined => {
  const trimmed = value.trim()
  if (
    trimmed.length !== 16
    || trimmed.charCodeAt(10) !== 84
    || trimmed.charCodeAt(13) !== 58
  ) {
    return undefined
  }

  const date = parseDateOnlyPartsExact(trimmed.slice(0, 10))
  const hour = read2Digits(trimmed, 11)
  const minute = read2Digits(trimmed, 14)
  if (
    !date
    || hour === undefined
    || minute === undefined
    || hour > 23
    || minute > 59
  ) {
    return undefined
  }

  return {
    ...date,
    hour,
    minute
  }
}

const parseDateTimeDraft = (value: string): DateTimeParts | undefined => {
  const parsed = parseDateTime(value)
  if (parsed) {
    return parsed
  }

  const normalized = value.trim().replace(/\s+/, ' ')
  if (!normalized) {
    return undefined
  }

  if (normalized.length !== 16 || normalized.charCodeAt(10) !== 32 || normalized.charCodeAt(13) !== 58) {
    return undefined
  }

  const date = parseDateOnlyPartsExact(normalized.slice(0, 10))
  const hour = read2Digits(normalized, 11)
  const minute = read2Digits(normalized, 14)
  if (
    !date
    || hour === undefined
    || minute === undefined
    || hour > 23
    || minute > 59
  ) {
    return undefined
  }

  return {
    ...date,
    hour,
    minute
  }
}

const createLocalDate = (
  parts: DateOnlyParts
): Date => new Date(
  parts.year,
  parts.month - 1,
  parts.day
)

const createLocalDateTime = (
  parts: DateTimeParts
): Date => new Date(
  parts.year,
  parts.month - 1,
  parts.day,
  parts.hour,
  parts.minute
)

const createZonedDateTime = (
  parts: DateTimeParts,
  timeZone: string
): Date | undefined => {
  const value = new TZDateMini(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    timeZone
  )

  return isValid(value) ? value : undefined
}

const isValidTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en-US', {
      timeZone: value
    })
    return true
  } catch {
    return false
  }
}

export const isValidDateTimeZone = (value: string) => {
  const normalized = value.trim()
  return normalized.length > 0 && isValidTimeZone(normalized)
}

const formatTimeValue = (
  value: DateLike,
  formatKind: TimeDisplayFormat
) => format(
  value,
  formatKind === '24h' ? 'HH:mm' : 'h:mm a'
)

const formatDateValueText = (
  value: DateLike,
  formatKind: DateDisplayFormat,
  fallbackText: string,
  relativeBase: DateLike
) => {
  if (formatKind === 'relative') {
    const offset = differenceInCalendarDays(value, relativeBase)
    if (offset === 0) {
      return 'Today'
    }
    if (offset === 1) {
      return 'Tomorrow'
    }
    if (offset === -1) {
      return 'Yesterday'
    }

    return fallbackText
  }

  switch (formatKind) {
    case 'full':
      return format(value, 'PPP')
    case 'mdy':
      return format(value, 'MM/dd/yyyy')
    case 'dmy':
      return format(value, 'dd/MM/yyyy')
    case 'ymd':
      return format(value, 'yyyy/MM/dd')
    case 'short':
    default:
      return format(value, 'M/d/yyyy')
  }
}

const readRelativeBase = (
  value: DateValue
): DateLike => (
  value.kind === 'datetime' && value.timezone
    ? TZDateMini.tz(value.timezone)
    : new Date()
)

const formatSingleDateValue = (
  value: DateValue,
  config: DateFieldConfig
) => {
  const relativeBase = readRelativeBase(value)

  if (value.kind === 'date') {
    const start = parseDateOnly(value.start)
    if (!start) {
      return undefined
    }

    return formatDateValueText(
      createLocalDate(start),
      config.displayDateFormat ?? 'short',
      value.start,
      relativeBase
    )
  }

  const start = parseDateTime(value.start)
  if (!start) {
    return undefined
  }

  const dateValue = value.timezone === null
    ? createLocalDateTime(start)
    : createZonedDateTime(start, value.timezone)
  if (!dateValue) {
    return undefined
  }

  const dateText = formatDateValueText(
    dateValue,
    config.displayDateFormat ?? 'short',
    value.start.slice(0, 10),
    relativeBase
  )
  const timeText = formatTimeValue(
    dateValue,
    config.displayTimeFormat ?? '12h'
  )

  return `${dateText} ${timeText}`
}

const resolveDateInput = (value: unknown): DateValue | undefined => {
  if (isGroupDateValue(value)) {
    return normalizeDateValue(value)
  }

  if (typeof value === 'string') {
    return parseDateInputDraft(value)
  }

  if (value instanceof Date) {
    return {
      kind: 'datetime',
      start: format(value, DATE_TIME_FORMAT),
      timezone: null
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return resolveDateInput(new Date(value))
  }

  return undefined
}

const getDateTimeParts = (value: DateValue) => {
  if (value.kind === 'date') {
    return parseDateOnly(value.start)
  }

  return parseDateTime(value.start)
}

const toComparableTimestamp = (value: DateValue): number | undefined => {
  if (value.kind === 'date') {
    const parts = parseDateOnly(value.start)
    return parts
      ? Date.UTC(parts.year, parts.month - 1, parts.day)
      : undefined
  }

  const parts = parseDateTime(value.start)
  if (!parts) {
    return undefined
  }

  const comparable = value.timezone === null
    ? createLocalDateTime(parts)
    : createZonedDateTime(parts, value.timezone)

  return comparable && isValid(comparable)
    ? comparable.getTime()
    : undefined
}

export const createDefaultDateFieldConfig = (): DateFieldConfig => ({
  displayDateFormat: 'short',
  displayTimeFormat: '12h',
  defaultValueKind: 'date',
  defaultTimezone: null
})

export const getDateFieldConfig = (
  field?: CustomField
): DateFieldConfig => {
  const defaults = createDefaultDateFieldConfig()

  if (!field || field.kind !== 'date') {
    return defaults
  }

  return {
    displayDateFormat: DATE_DISPLAY_FORMATS.includes(field.displayDateFormat ?? 'short')
      ? field.displayDateFormat ?? 'short'
      : defaults.displayDateFormat,
    displayTimeFormat: DATE_TIME_FORMATS.includes(field.displayTimeFormat ?? '12h')
      ? field.displayTimeFormat ?? '12h'
      : defaults.displayTimeFormat,
    defaultValueKind: DATE_VALUE_KINDS.includes(field.defaultValueKind ?? 'date')
      ? field.defaultValueKind ?? 'date'
      : defaults.defaultValueKind,
    defaultTimezone: typeof field.defaultTimezone === 'string'
      ? isValidDateTimeZone(field.defaultTimezone)
        ? field.defaultTimezone.trim()
        : defaults.defaultTimezone
      : field.defaultTimezone === null
        ? null
        : defaults.defaultTimezone
  }
}

export const isDateOnlyString = (value: string) => Boolean(parseDateOnly(value))

export const isDateTimeString = (value: string) => Boolean(parseDateTime(value))

export const isGroupDateValue = (value: unknown): value is DateValue => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const input = value as DateValue
  if (input.kind === 'date') {
    return typeof input.start === 'string' && (input.end === undefined || typeof input.end === 'string')
  }

  return input.kind === 'datetime'
    && typeof input.start === 'string'
    && (input.end === undefined || typeof input.end === 'string')
    && (input.timezone === null || typeof input.timezone === 'string')
}

export const normalizeDateValue = (
  value: DateValue
): DateValue | undefined => {
  if (value.kind === 'date') {
    const start = parseDateOnly(value.start)
    const end = value.end ? parseDateOnly(value.end) : undefined
    if (!start || (value.end !== undefined && !end)) {
      return undefined
    }

    const normalizedStart = toDateOnlyString(start)
    const normalizedEnd = end ? toDateOnlyString(end) : undefined
    if (normalizedEnd && normalizedEnd < normalizedStart) {
      return {
        kind: 'date',
        start: normalizedEnd,
        end: normalizedStart
      }
    }

    return {
      kind: 'date',
      start: normalizedStart,
      ...(normalizedEnd ? { end: normalizedEnd } : {})
    }
  }

  const start = parseDateTime(value.start)
  const end = value.end ? parseDateTime(value.end) : undefined
  const normalizedTimezone = value.timezone === null
    ? null
    : typeof value.timezone === 'string' && value.timezone.trim()
      ? value.timezone.trim()
      : undefined

  if (
    !start
    || (value.end !== undefined && !end)
    || normalizedTimezone === undefined
    || (normalizedTimezone !== null && !isValidTimeZone(normalizedTimezone))
  ) {
    return undefined
  }

  const normalizedStart = toDateTimeString(start)
  const normalizedEnd = end ? toDateTimeString(end) : undefined
  if (normalizedEnd && normalizedEnd < normalizedStart) {
    return {
      kind: 'datetime',
      start: normalizedEnd,
      end: normalizedStart,
      timezone: normalizedTimezone
    }
  }

  return {
    kind: 'datetime',
    start: normalizedStart,
    ...(normalizedEnd ? { end: normalizedEnd } : {}),
    timezone: normalizedTimezone
  }
}

export const parseDateInputDraft = (
  value: string
): DateValue | undefined => {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const dateOnly = parseDateOnly(trimmed)
  if (dateOnly) {
    return {
      kind: 'date',
      start: toDateOnlyString(dateOnly)
    }
  }

  const dateTime = parseDateTimeDraft(trimmed)
  if (dateTime) {
    return {
      kind: 'datetime',
      start: toDateTimeString(dateTime),
      timezone: null
    }
  }

  return undefined
}

export const readDateComparableTimestamp = (
  value: unknown
): number | undefined => {
  const resolved = resolveDateInput(value)
  return resolved
    ? toComparableTimestamp(resolved)
    : undefined
}

export const getDateSortKey = (
  value: unknown
): string | undefined => {
  const resolved = resolveDateInput(value)
  if (!resolved) {
    return undefined
  }

  if (resolved.kind === 'date') {
    return resolved.end
      ? `date:${resolved.start}..${resolved.end}`
      : `date:${resolved.start}`
  }

  const scope = resolved.timezone ?? 'floating'
  return resolved.end
    ? `datetime:${resolved.start}..${resolved.end}@${scope}`
    : `datetime:${resolved.start}@${scope}`
}

export const getDateGroupKey = (
  value: unknown
): string | undefined => getDateSortKey(value)

export const createDateGroupKey = (
  mode: DateGroupMode,
  start: string
) => `${mode}:${start}`

export const parseDateGroupKey = (
  key: string
): {
  mode: DateGroupMode
  start: string
} | undefined => {
  const separator = key.indexOf(':')
  if (separator <= 0) {
    return undefined
  }

  const mode = key.slice(0, separator)
  const start = key.slice(separator + 1)
  return DATE_GROUP_MODES.includes(mode as DateGroupMode) && parseDateOnly(start)
    ? {
        mode: mode as DateGroupMode,
        start
      }
    : undefined
}

const readDateStartParts = (
  value: DateValue
) => value.kind === 'date'
  ? parseDateOnly(value.start)
  : parseDateOnly(value.start.slice(0, 10))

export const readDateGroupStart = (
  value: unknown,
  mode: DateGroupMode
): string | undefined => {
  const resolved = resolveDateInput(value)
  const parts = resolved
    ? readDateStartParts(resolved)
    : undefined
  if (!parts) {
    return undefined
  }

  const start = createLocalDate(parts)
  const grouped = (() => {
    switch (mode) {
      case 'day':
        return start
      case 'week':
        return startOfWeek(start, {
          weekStartsOn: 0
        })
      case 'month':
        return startOfMonth(start)
      case 'quarter':
        return startOfQuarter(start)
      case 'year':
        return startOfYear(start)
      default:
        return start
    }
  })()

  return toDateOnlyString(readDateOnlyParts(grouped))
}

export const formatDateGroupTitle = (
  start: string,
  mode: DateGroupMode
): string => {
  const parts = parseDateOnly(start)
  if (!parts) {
    return start
  }

  const value = createLocalDate(parts)

  switch (mode) {
    case 'day':
      return format(value, 'PPP')
    case 'week':
      return `Week of ${format(value, 'PPP')}`
    case 'month':
      return format(value, 'LLLL yyyy')
    case 'quarter':
      return `Q${Math.floor(value.getMonth() / 3) + 1} ${format(value, 'yyyy')}`
    case 'year':
      return format(value, 'yyyy')
    default:
      return start
  }
}

export const createDateGroupValue = (
  field: CustomField | undefined,
  start: string,
  currentValue: unknown
): DateValue | undefined => {
  if (!parseDateOnly(start)) {
    return undefined
  }

  const current = resolveDateInput(currentValue)
  const kind = current?.kind ?? resolveDefaultDateValueKind(field)

  if (kind === 'date') {
    return {
      kind: 'date',
      start
    }
  }

  return {
    kind: 'datetime',
    start: `${start}T00:00`,
    timezone: current?.kind === 'datetime'
      ? current.timezone
      : resolveDefaultDateTimezone(field)
  }
}

export const formatDateValue = (
  field: CustomField | undefined,
  value: unknown
): string | undefined => {
  const resolved = resolveDateInput(value)
  if (!resolved) {
    return undefined
  }

  const config = getDateFieldConfig(field)

  const startText = formatSingleDateValue(
    {
      kind: resolved.kind,
      start: resolved.start,
      ...(resolved.kind === 'datetime'
        ? { timezone: resolved.timezone }
        : {})
    } as DateValue,
    config
  )
  if (!startText) {
    return undefined
  }

  if (!resolved.end) {
    return startText
  }

  const endText = formatSingleDateValue(
    {
      kind: resolved.kind,
      start: resolved.end,
      ...(resolved.kind === 'datetime'
        ? { timezone: resolved.timezone }
        : {})
    } as DateValue,
    config
  )

  return endText
    ? `${startText} -> ${endText}`
    : startText
}

export const getDateSearchTokens = (
  field: CustomField | undefined,
  value: unknown
): string[] => {
  const resolved = resolveDateInput(value)
  if (!resolved) {
    return typeof value === 'string' && value.trim()
      ? [value.trim()]
      : []
  }

  const formatted = formatDateValue(field, resolved)
  const values = [
    resolved.start,
    resolved.end,
    resolved.kind,
    resolved.kind === 'datetime' ? resolved.timezone ?? 'floating' : undefined,
    formatted
  ]

  return Array.from(new Set(values.filter((item): item is string => Boolean(item))))
}

export const resolveDefaultDateValueKind = (
  field?: CustomField
): DateValueKind => getDateFieldConfig(field).defaultValueKind ?? 'date'

export const resolveDefaultDateTimezone = (
  field?: CustomField
) => getDateFieldConfig(field).defaultTimezone ?? null

export const getAvailableTimezones = () => {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone
  return Array.from(new Set([
    local,
    ...COMMON_TIMEZONES
  ].filter((value): value is string => Boolean(value) && isValidTimeZone(value))))
}

export const formatTimeZoneLabel = (timeZone: string | null) => {
  if (timeZone === null) {
    return 'Floating'
  }

  return timeZone
}

export const readDateValueKind = (
  value: unknown
): DateValueKind | undefined => {
  const resolved = resolveDateInput(value)
  return resolved?.kind
}

export const readDateValue = (
  value: unknown
): DateValue | undefined => resolveDateInput(value)

export const readDatePrimaryString = (
  value: unknown
): string | undefined => resolveDateInput(value)?.start

export const readDatePrimaryParts = (
  value: unknown
): DateOnlyParts | DateTimeParts | undefined => {
  const resolved = resolveDateInput(value)
  return resolved ? getDateTimeParts(resolved) : undefined
}
