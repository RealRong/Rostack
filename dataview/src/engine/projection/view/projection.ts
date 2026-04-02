import type {
  GroupDocument,
  GroupProperty,
  GroupRecord,
  GroupView,
  RecordId,
  ViewId
} from '@/core/contracts'
import {
  getDocumentProperties
} from '@/core/document'
import {
  resolveGroupedRecords
} from '@/core/query/grouping'
import {
  resolveViewRecordState
} from '@/core/view'
import type {
  Appearance,
  AppearanceId,
  Schema,
  SectionKey,
  ViewProjection
} from './types'
import { createAppearances } from './appearances'
import { createGrouping } from './grouping'
import { createProperties } from './properties'
import { createSections } from './sections'

export interface ProjectionResult {
  view: GroupView
  schema: Schema
  appearances: ReadonlyMap<AppearanceId, Appearance>
  sections: readonly ProjectionSection[]
}

export interface ProjectionSection {
  key: SectionKey
  title: string
  color?: string
  ids: readonly AppearanceId[]
}

const ROOT_SECTION_KEY = 'root' as SectionKey

const createSchema = (
  properties: readonly GroupProperty[]
): Schema => ({
  properties: new Map(
    properties.map(property => [property.id, property] as const)
  )
})

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
  document: GroupDocument
  view: GroupView
  visibleRecords: readonly GroupRecord[]
}): {
  appearances: ReadonlyMap<AppearanceId, Appearance>
  sections: readonly ProjectionSection[]
} => {
  const appearances = new Map<AppearanceId, Appearance>()
  const sections = resolveGroupedRecords(
    input.document,
    input.visibleRecords,
    input.view.query.group
  ).map(group => ({
    key: group.key,
    title: group.title,
    color: group.color,
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
  visibleRecords: readonly GroupRecord[]
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

export const resolveProjection = (
  document: GroupDocument,
  viewId?: ViewId
): ProjectionResult | undefined => {
  const {
    view,
    visibleRecords
  } = resolveViewRecordState(document, viewId)

  if (!view) {
    return undefined
  }

  const properties = getDocumentProperties(document)

  return {
    view,
    schema: createSchema(properties),
    ...(view.query.group
      ? createGroupedProjection({
          document,
          view,
          visibleRecords
        })
      : createFlatProjection(visibleRecords)
    )
  }
}

export const resolveViewProjection = (
  document: GroupDocument,
  viewId: ViewId
): ViewProjection | undefined => {
  const resolved = resolveProjection(document, viewId)
  if (!resolved) {
    return undefined
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

  return {
    view: resolved.view,
    schema: resolved.schema,
    appearances: createAppearances({
      byId: resolved.appearances,
      sections
    }),
    sections,
    properties: createProperties({
      propertyIds: resolved.view.options.display.propertyIds,
      byId: resolved.schema.properties
    })
  }
}
