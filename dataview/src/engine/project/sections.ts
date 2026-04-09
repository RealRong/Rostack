import type {
  DataDoc,
  RecordId,
  Row,
  View,
  ViewGroup
} from '@dataview/core/contracts'
import {
  resolveGroupedRecords
} from '@dataview/core/group'
import {
  recordIdsOfAppearances
} from './appearances'
import type {
  Appearance,
  AppearanceId,
  AppearanceList,
  Section,
  SectionBucket,
  SectionKey
} from './types'

export interface ProjectionSection {
  key: SectionKey
  title: string
  color?: string
  bucket?: SectionBucket
  ids: readonly AppearanceId[]
}

const ROOT_SECTION_KEY = 'root' as SectionKey
const emptyIds = [] as const

const createAppearanceId = (input: {
  section: SectionKey
  recordId: RecordId
  slot: number
}): AppearanceId => `section:${input.section}\u0000record:${input.recordId}\u0000slot:${input.slot}`

const materializeAppearances = (input: {
  section: SectionKey
  recordIds: readonly RecordId[]
  appearances: Map<AppearanceId, Appearance>
}): readonly AppearanceId[] => {
  const slots = new Map<RecordId, number>()

  return input.recordIds.map(recordId => {
    const slot = slots.get(recordId) ?? 0
    slots.set(recordId, slot + 1)

    const id = createAppearanceId({
      section: input.section,
      recordId,
      slot
    })

    input.appearances.set(id, {
      id,
      recordId,
      section: input.section
    })

    return id
  })
}

const createGroupedProjection = (input: {
  document: DataDoc
  view: View
  visibleRecords: readonly Row[]
}): {
  appearances: ReadonlyMap<AppearanceId, Appearance>
  sections: readonly ProjectionSection[]
} => {
  const appearances = new Map<AppearanceId, Appearance>()
  const sections = resolveGroupedRecords(
    input.document,
    input.visibleRecords,
    input.view.group
  ).map(group => ({
    key: group.key,
    title: group.title,
    color: group.color,
    bucket: {
      key: group.key,
      title: group.title,
      value: group.value,
      clearValue: group.clearValue,
      empty: group.empty,
      color: group.color
    },
    ids: materializeAppearances({
      section: group.key,
      recordIds: group.records,
      appearances
    })
  } satisfies ProjectionSection))

  return {
    appearances,
    sections
  }
}

const createFlatProjection = (
  visibleRecords: readonly Row[]
): {
  appearances: ReadonlyMap<AppearanceId, Appearance>
  sections: readonly ProjectionSection[]
} => {
  const appearances = new Map<AppearanceId, Appearance>()
  const section: ProjectionSection = {
    key: ROOT_SECTION_KEY,
    title: 'All',
    ids: materializeAppearances({
      section: ROOT_SECTION_KEY,
      recordIds: visibleRecords.map(record => record.id),
      appearances
    })
  }

  return {
    appearances,
    sections: [section]
  }
}

export const buildSectionProjection = (input: {
  document: DataDoc
  view: View
  visibleRecords: readonly Row[]
}) => (
  input.view.group
    ? createGroupedProjection(input)
    : createFlatProjection(input.visibleRecords)
)

export const createSections = (
  source: readonly ProjectionSection[],
  group: ViewGroup | undefined
): readonly Section[] => {
  if (!group) {
    return source.map(section => ({
      ...section,
      collapsed: false
    }))
  }

  const showEmpty = group.showEmpty !== false

  return source.flatMap(section => {
    const state = group.buckets?.[section.key]
    if (state?.hidden === true) {
      return []
    }

    if (!showEmpty && section.ids.length === 0) {
      return []
    }

    return [{
      ...section,
      collapsed: state?.collapsed === true
    } satisfies Section]
  })
}

export const sectionIds = (
  source: readonly Pick<Section, 'key' | 'ids'>[],
  sectionKey: SectionKey
) => source.find(section => section.key === sectionKey)?.ids ?? emptyIds

export const readSectionRecordIds = (input: {
  sections: readonly Pick<Section, 'key' | 'ids'>[]
  appearances: Pick<AppearanceList, 'get'>
}, sectionKey: SectionKey): readonly RecordId[] => {
  const ids = sectionIds(input.sections, sectionKey)
  return ids.length
    ? recordIdsOfAppearances(input.appearances, ids)
    : emptyIds
}
