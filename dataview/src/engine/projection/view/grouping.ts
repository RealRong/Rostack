import type {
  GroupDocument,
  GroupProperty,
  GroupView,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import {
  GROUP_KANBAN_EMPTY_BUCKET_KEY
} from '@dataview/core/contracts'
import {
  getDocumentPropertyById
} from '@dataview/core/document'
import {
  GROUP_STATUS_CATEGORIES,
  createDateGroupValue,
  getPropertyOption,
  getStatusDefaultOption,
  parseDateGroupKey
} from '@dataview/core/property'
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

export type GroupNext =
  | { value: unknown }
  | { clear: true }

export interface Grouping {
  sections: readonly Section[]
  next: (
    value: unknown,
    from: SectionKey | undefined,
    to: SectionKey
  ) => GroupNext | undefined
}

const emptyRecordIds = [] as const satisfies readonly RecordId[]

const isEmptySection = (
  key: SectionKey
) => key === GROUP_KANBAN_EMPTY_BUCKET_KEY

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
): GroupNext => (
  isEmptySection(sectionKey)
    ? { clear: true }
    : { value: sectionKey }
)

const nextNumberValue = (
  sectionKey: SectionKey
): GroupNext | undefined => {
  if (isEmptySection(sectionKey)) {
    return { clear: true }
  }

  const range = parseNumberRangeKey(sectionKey)
  return range
    ? { value: range.start }
    : undefined
}

const nextSelectValue = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  sectionKey: SectionKey
): GroupNext | undefined => {
  if (isEmptySection(sectionKey)) {
    return { clear: true }
  }

  return getPropertyOption(property, sectionKey)
    ? { value: sectionKey }
    : undefined
}

const nextStatusValue = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  mode: string,
  sectionKey: SectionKey
): GroupNext | undefined => {
  if (isEmptySection(sectionKey)) {
    return { clear: true }
  }

  if (mode === 'category') {
    const category = sectionKey as typeof GROUP_STATUS_CATEGORIES[number]

    if (!GROUP_STATUS_CATEGORIES.includes(category)) {
      return undefined
    }

    const option = getStatusDefaultOption(property, category)
    return option
      ? { value: option.id }
      : undefined
  }

  return getPropertyOption(property, sectionKey)
    ? { value: sectionKey }
    : undefined
}

const nextCheckboxValue = (
  sectionKey: SectionKey
): GroupNext | undefined => {
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
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  sectionKey: SectionKey,
  currentValue: unknown
): GroupNext | undefined => {
  if (isEmptySection(sectionKey)) {
    return { clear: true }
  }

  const parsed = parseDateGroupKey(sectionKey)
  if (!parsed) {
    return undefined
  }

  const next = createDateGroupValue(
    property,
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
): GroupNext => {
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
): GroupNext | undefined => (
  isEmptySection(sectionKey)
    ? { clear: true }
    : undefined
)

const createNext = (
  property: GroupProperty,
  mode: string
): Grouping['next'] => (
  value,
  from,
  to
) => {
  switch (property.kind) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return nextTextValue(to)
    case 'number':
      return nextNumberValue(to)
    case 'date':
      return nextDateValue(property, to, value)
    case 'select':
      return nextSelectValue(property, to)
    case 'status':
      return nextStatusValue(property, mode, to)
    case 'checkbox':
      return nextCheckboxValue(to)
    case 'multiSelect':
      return nextMultiSelectValue(to, value, from)
    case 'file':
    case 'media':
      return nextPresenceValue(to)
    default:
      return undefined
  }
}

export const createGrouping = (input: {
  document: GroupDocument
  view: Pick<GroupView, 'query'>
  sections: readonly ProjectionSection[]
}): Grouping | undefined => {
  const group = input.view.query.group
  if (!group) {
    return undefined
  }

  const property = getDocumentPropertyById(input.document, group.property)
  if (!property) {
    return undefined
  }

  return {
    sections: createSections(input.sections, group),
    next: createNext(property, group.mode)
  }
}

export const resolveGrouping = (
  document: GroupDocument,
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
  document: GroupDocument,
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
    resolved.view.query.group
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
