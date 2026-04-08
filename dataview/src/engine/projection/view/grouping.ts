import type {
  DataDoc,
  Field,
  CustomField,
  View,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import {
  KANBAN_EMPTY_BUCKET_KEY
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  STATUS_CATEGORIES,
  createDateGroupValue,
  getFieldOption,
  getStatusDefaultOption,
  parseDateGroupKey
} from '@dataview/core/field'
import {
  resolveProjection,
  type ProjectionSection
} from './projection'
import {
  createAppearances,
  recordIdsOfAppearances
} from './appearances'
import {
  createSections
} from './sections'
import type {
  AppearanceList,
  Section,
  SectionKey
} from './types'

export type GroupingNextValue =
  | { value: unknown }
  | { clear: true }

export interface Grouping {
  sections: readonly Section[]
  next: (
    value: unknown,
    from: SectionKey | undefined,
    to: SectionKey
  ) => GroupingNextValue | undefined
}

const emptyRecordIds = [] as const satisfies readonly RecordId[]

const isEmptySection = (
  key: SectionKey
) => key === KANBAN_EMPTY_BUCKET_KEY

const parseNumberRangeKey = (
  key: string
): {
  start: number
  interval: number
} | undefined => {
  const match = /^range:([^:]+):([^:]+)$/.exec(key)
  if (!match) {
    return undefined
  }

  const start = Number(match[1])
  const interval = Number(match[2])
  return Number.isFinite(start) && Number.isFinite(interval) && interval > 0
    ? {
        start,
        interval
      }
    : undefined
}

const normalizeOptionIds = (
  value: unknown
): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const next: string[] = []

  value.forEach(item => {
    if (typeof item !== 'string') {
      return
    }

    const normalized = item.trim()
    if (!normalized || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    next.push(normalized)
  })

  return next
}

const removeOptionId = (
  ids: readonly string[],
  optionId: string
) => ids.filter(id => id !== optionId)

const appendOptionId = (
  ids: readonly string[],
  optionId: string
) => ids.includes(optionId)
  ? [...ids]
  : [...ids, optionId]

const nextTextValue = (
  sectionKey: SectionKey
): GroupingNextValue => (
  isEmptySection(sectionKey)
    ? { clear: true }
    : { value: sectionKey }
)

const nextNumberValue = (
  sectionKey: SectionKey
): GroupingNextValue | undefined => {
  if (isEmptySection(sectionKey)) {
    return { clear: true }
  }

  const range = parseNumberRangeKey(sectionKey)
  return range
    ? { value: range.start }
    : undefined
}

const nextSelectValue = (
  field: CustomField | undefined,
  sectionKey: SectionKey
): GroupingNextValue | undefined => {
  if (isEmptySection(sectionKey)) {
    return { clear: true }
  }

  return getFieldOption(field, sectionKey)
    ? { value: sectionKey }
    : undefined
}

const nextStatusValue = (
  field: CustomField | undefined,
  mode: string,
  sectionKey: SectionKey
): GroupingNextValue | undefined => {
  if (isEmptySection(sectionKey)) {
    return { clear: true }
  }

  if (mode === 'category') {
    const category = sectionKey as typeof STATUS_CATEGORIES[number]

    if (!STATUS_CATEGORIES.includes(category)) {
      return undefined
    }

    const option = getStatusDefaultOption(field, category)
    return option
      ? { value: option.id }
      : undefined
  }

  return getFieldOption(field, sectionKey)
    ? { value: sectionKey }
    : undefined
}

const nextCheckboxValue = (
  sectionKey: SectionKey
): GroupingNextValue | undefined => {
  if (isEmptySection(sectionKey)) {
    return { clear: true }
  }

  if (sectionKey === 'true') {
    return { value: true }
  }

  if (sectionKey === 'false') {
    return { value: false }
  }

  return undefined
}

const nextDateValue = (
  field: CustomField | undefined,
  sectionKey: SectionKey,
  currentValue: unknown
): GroupingNextValue | undefined => {
  if (isEmptySection(sectionKey)) {
    return { clear: true }
  }

  const parsed = parseDateGroupKey(sectionKey)
  if (!parsed) {
    return undefined
  }

  const next = createDateGroupValue(
    field,
    parsed.start,
    currentValue
  )

  return next
    ? { value: next }
    : undefined
}

const nextMultiSelectValue = (
  sectionKey: SectionKey,
  currentValue: unknown,
  from: SectionKey | undefined
): GroupingNextValue => {
  let next = normalizeOptionIds(currentValue)

  if (from && !isEmptySection(from)) {
    next = removeOptionId(next, from)
  }

  if (!isEmptySection(sectionKey)) {
    next = appendOptionId(next, sectionKey)
  }

  return next.length
    ? { value: next }
    : { clear: true }
}

const nextPresenceValue = (
  sectionKey: SectionKey
): GroupingNextValue | undefined => (
  isEmptySection(sectionKey)
    ? { clear: true }
    : undefined
)

const createNext = (
  field: Field,
  mode: string
): Grouping['next'] => (
  value,
  from,
  to
) => {
  switch (field.kind) {
    case 'title':
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return nextTextValue(to)
    case 'number':
      return nextNumberValue(to)
    case 'date':
      return nextDateValue(field, to, value)
    case 'select':
      return nextSelectValue(field, to)
    case 'status':
      return nextStatusValue(field, mode, to)
    case 'boolean':
      return nextCheckboxValue(to)
    case 'multiSelect':
      return nextMultiSelectValue(to, value, from)
    case 'asset':
      return nextPresenceValue(to)
    default:
      return undefined
  }
}

export const createGrouping = (input: {
  document: DataDoc
  view: Pick<View, 'group'>
  sections: readonly ProjectionSection[]
}): Grouping | undefined => {
  const group = input.view.group
  if (!group) {
    return undefined
  }

  const field = getDocumentFieldById(input.document, group.field)
  if (!field) {
    return undefined
  }

  return {
    sections: createSections(input.sections, group),
    next: createNext(field, group.mode)
  }
}

export const resolveGrouping = (
  document: DataDoc,
  viewId: ViewId | undefined
): Grouping | undefined => {
  const resolved = resolveProjection(document, viewId)
  if (!resolved) {
    return undefined
  }

  return createGrouping({
    document,
    view: resolved.view,
    sections: resolved.sections
  })
}

export const readSectionRecordIds = (
  input: {
    sections: readonly Pick<Section, 'key' | 'ids'>[]
    appearances: Pick<AppearanceList, 'get'>
  },
  sectionKey: SectionKey
): readonly RecordId[] => {
  const section = input.sections.find(item => item.key === sectionKey)

  return section
    ? recordIdsOfAppearances(input.appearances, section.ids)
    : emptyRecordIds
}

export const resolveSectionRecordIds = (
  document: DataDoc,
  viewId: ViewId | undefined,
  sectionKey: SectionKey
): readonly RecordId[] => {
  const resolved = resolveProjection(document, viewId)
  if (!resolved) {
    return emptyRecordIds
  }

  const grouping = createGrouping({
    document,
    view: resolved.view,
    sections: resolved.sections
  })
  const sections = grouping?.sections ?? createSections(
    resolved.sections,
    resolved.view.group
  )

  return readSectionRecordIds(
    {
      sections,
      appearances: createAppearances({
        byId: resolved.appearances,
        sections
      })
    },
    sectionKey
  )
}
