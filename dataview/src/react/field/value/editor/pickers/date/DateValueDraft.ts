import {
  format,
  setMilliseconds,
  setMinutes,
  setSeconds
} from 'date-fns'
import type { DateValue, CustomField } from '@dataview/core/contracts'
import {
  type DateValueKind,
  isDateOnlyString,
  normalizeDateValue,
  parseDateInputDraft,
  type FieldDraftParseResult,
  readDateValue,
  resolveDefaultDateTimezone,
  resolveDefaultDateValueKind
} from '@dataview/core/field'

export type DateDraftBoundary = 'start' | 'end'

export interface DateValueDraft {
  kind: DateValueKind
  active: DateDraftBoundary
  startDate: string
  startTime: string
  endEnabled: boolean
  endDate: string
  endTime: string
  timezone: string | null
  hasValue: boolean
  dirty: boolean
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

const toLocalDateString = (value: Date) => (
  format(value, 'yyyy-MM-dd')
)

const toRoundedTimeString = (value: Date) => {
  let rounded = setMilliseconds(setSeconds(value, 0), 0)
  rounded = setMinutes(
    rounded,
    Math.floor(rounded.getMinutes() / 30) * 30
  )
  return format(rounded, 'HH:mm')
}

const splitDateTime = (value: string) => {
  const [date, time] = value.split('T')
  return isDateOnlyString(date) && TIME_RE.test(time ?? '')
    ? {
        date,
        time: time.slice(0, 5)
      }
    : undefined
}

const normalizeTimeInput = (value: string) => {
  const normalized = value.trim().slice(0, 5)
  return TIME_RE.test(normalized) ? normalized : undefined
}

const markDirty = (draft: DateValueDraft): DateValueDraft => ({
  ...draft,
  dirty: true
})

const createBaseDraft = (
  property: CustomField | undefined
): DateValueDraft => {
  const now = new Date()
  const today = toLocalDateString(now)
  const roundedTime = toRoundedTimeString(now)
  const kind = resolveDefaultDateValueKind(property)

  return {
    kind,
    active: 'start',
    startDate: today,
    startTime: roundedTime,
    endEnabled: false,
    endDate: today,
    endTime: roundedTime,
    timezone: kind === 'datetime'
      ? resolveDefaultDateTimezone(property)
      : null,
    hasValue: false,
    dirty: false
  }
}

const fromResolvedDateValue = (
  property: CustomField | undefined,
  value: DateValue
): DateValueDraft => {
  const base = createBaseDraft(property)

  if (value.kind === 'date') {
    return {
      ...base,
      kind: 'date',
      startDate: value.start,
      endEnabled: Boolean(value.end),
      endDate: value.end ?? value.start,
      timezone: null,
      hasValue: true,
      dirty: false
    }
  }

  const start = splitDateTime(value.start)
  const end = value.end ? splitDateTime(value.end) : undefined

  if (!start) {
    return base
  }

  return {
    ...base,
    kind: 'datetime',
    startDate: start.date,
    startTime: start.time,
    endEnabled: Boolean(end),
    endDate: end?.date ?? start.date,
    endTime: end?.time ?? start.time,
    timezone: value.timezone,
    hasValue: true,
    dirty: false
  }
}

export const createDateValueDraft = (
  property: CustomField | undefined,
  value: unknown,
  seedDraft?: string
): DateValueDraft => {
  const resolved = readDateValue(value)
    ?? (seedDraft ? parseDateInputDraft(seedDraft) : undefined)

  return resolved
    ? fromResolvedDateValue(property, resolved)
    : createBaseDraft(property)
}

export const readDateDraftBoundaryDate = (
  draft: DateValueDraft,
  boundary: DateDraftBoundary
) => boundary === 'end' ? draft.endDate : draft.startDate

export const setDateDraftActiveBoundary = (
  draft: DateValueDraft,
  active: DateDraftBoundary
): DateValueDraft => {
  if (active === 'end' && !draft.endEnabled) {
    return draft
  }

  return {
    ...draft,
    active
  }
}

export const setDateDraftKind = (
  draft: DateValueDraft,
  kind: DateValueKind,
  defaultTimezone: string | null
): DateValueDraft => {
  if (draft.kind === kind) {
    return draft
  }

  return markDirty({
    ...draft,
    kind,
    timezone: kind === 'datetime'
      ? draft.timezone ?? defaultTimezone
      : null
  })
}

export const setDateDraftRangeEnabled = (
  draft: DateValueDraft,
  endEnabled: boolean
): DateValueDraft => {
  if (draft.endEnabled === endEnabled) {
    return draft
  }

  return markDirty({
    ...draft,
    endEnabled,
    active: endEnabled ? 'end' : 'start',
    endDate: endEnabled
      ? draft.endDate || draft.startDate
      : draft.startDate,
    endTime: endEnabled
      ? draft.endTime || draft.startTime
      : draft.startTime
  })
}

export const setDateDraftBoundaryDate = (
  draft: DateValueDraft,
  boundary: DateDraftBoundary,
  value: string
): DateValueDraft => (
  boundary === 'end'
    ? markDirty({
        ...draft,
        endDate: value
      })
    : markDirty({
        ...draft,
        startDate: value,
        ...(draft.endEnabled && !draft.endDate
          ? { endDate: value }
          : {})
      })
)

export const setDateDraftBoundaryTime = (
  draft: DateValueDraft,
  boundary: DateDraftBoundary,
  value: string
): DateValueDraft => (
  boundary === 'end'
    ? markDirty({
        ...draft,
        endTime: value
      })
    : markDirty({
        ...draft,
        startTime: value,
        ...(draft.endEnabled && !draft.endTime
          ? { endTime: value }
          : {})
      })
)

export const setDateDraftTimezone = (
  draft: DateValueDraft,
  timezone: string | null
): DateValueDraft => markDirty({
  ...draft,
  timezone
})

export const applyDateDraftNow = (
  draft: DateValueDraft,
  boundary: DateDraftBoundary
): DateValueDraft => {
  const now = new Date()
  const nextDate = toLocalDateString(now)
  const nextTime = toRoundedTimeString(now)

  return boundary === 'end'
    ? markDirty({
        ...draft,
        endDate: nextDate,
        endTime: nextTime
      })
    : markDirty({
        ...draft,
        startDate: nextDate,
        startTime: nextTime,
        ...(draft.endEnabled && !draft.endDate
          ? { endDate: nextDate }
          : {}),
        ...(draft.endEnabled && !draft.endTime
          ? { endTime: nextTime }
          : {})
      })
}

export const clearDateValueDraft = (
  draft: DateValueDraft
): DateValueDraft => ({
  ...draft,
  startDate: '',
  startTime: draft.startTime || '00:00',
  endEnabled: false,
  endDate: '',
  endTime: '',
  dirty: true,
  hasValue: false,
  active: 'start'
})

export const parseDateValueDraft = (
  draft: DateValueDraft
): FieldDraftParseResult => {
  if (!draft.hasValue && !draft.dirty) {
    return { type: 'clear' }
  }

  if (!draft.startDate.trim()) {
    return { type: 'clear' }
  }

  if (!isDateOnlyString(draft.startDate)) {
    return { type: 'invalid' }
  }

  if (draft.kind === 'date') {
    const value = normalizeDateValue({
      kind: 'date',
      start: draft.startDate,
      ...(draft.endEnabled
        ? {
            end: isDateOnlyString(draft.endDate)
              ? draft.endDate
              : draft.startDate
          }
        : {})
    })

    return value
      ? { type: 'set', value }
      : { type: 'invalid' }
  }

  const startTime = normalizeTimeInput(draft.startTime) ?? '00:00'
  const endDate = draft.endEnabled
    ? (isDateOnlyString(draft.endDate) ? draft.endDate : draft.startDate)
    : undefined
  const endTime = draft.endEnabled
    ? normalizeTimeInput(draft.endTime) ?? startTime
    : undefined
  const value = normalizeDateValue({
    kind: 'datetime',
    start: `${draft.startDate}T${startTime}`,
    ...(draft.endEnabled && endDate
      ? {
          end: `${endDate}T${endTime ?? startTime}`
        }
      : {}),
    timezone: draft.timezone
  })

  return value
    ? { type: 'set', value }
    : { type: 'invalid' }
}
