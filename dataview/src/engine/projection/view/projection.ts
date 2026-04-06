import type {
  DataDoc,
  Field,
  Row,
  View,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFields
} from '@dataview/core/document'
import {
  resolveGroupedRecords
} from '@dataview/core/query/grouping'
import {
  resolveViewRecordState
} from '@dataview/core/view'
import type {
  Appearance,
  AppearanceId,
  Schema,
  SectionBucket,
  SectionKey,
  ViewProjection
} from './types'
import { createAppearances } from './appearances'
import { createGrouping } from './grouping'
import { createFields } from './fields'
import { createSections } from './sections'

export interface ProjectionResult {
  view: View
  schema: Schema
  appearances: ReadonlyMap<AppearanceId, Appearance>
  sections: readonly ProjectionSection[]
}

export interface ProjectionSection {
  key: SectionKey
  title: string
  color?: string
  bucket?: SectionBucket
  ids: readonly AppearanceId[]
}

const ROOT_SECTION_KEY = 'root' as SectionKey

const createSchema = (
  fields: readonly Field[]
): Schema => ({
  fields: new Map(
    fields.map(field => [field.id, field] as const)
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
    input.view.query.group
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

export const resolveProjection = (
  document: DataDoc,
  viewId?: ViewId
): ProjectionResult | undefined => {
  const {
    view,
    visibleRecords
  } = resolveViewRecordState(document, viewId)

  if (!view) {
    return undefined
  }

  const fields = getDocumentFields(document)

  return {
    view,
    schema: createSchema(fields),
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
  document: DataDoc,
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
    fields: createFields({
      fieldIds: resolved.view.options.display.fieldIds,
      byId: resolved.schema.fields
    })
  }
}
