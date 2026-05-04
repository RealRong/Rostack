import type {
  DataviewActiveSpec,
  DataviewFrame
} from '@dataview/engine/active/frame'
import type {
  DataviewActivePlan
} from '@dataview/engine/active/plan'
import type {
  DataviewActiveState,
  MembershipPhaseState,
  QueryPhaseState,
  SummaryPhaseState
} from '@dataview/engine/active/state'
import {
  publishViewBase
} from '@dataview/engine/active/publish/base'
import {
  publishSections
} from '@dataview/engine/active/publish/sections'
import {
  publishStruct
} from '@dataview/engine/active/publish/deltaPublish'
import {
  publishSummaries
} from '@dataview/engine/active/publish/summaries'
import type {
  CalculationCollection
} from '@dataview/core/view'
import type {
  Field,
  FieldId
} from '@dataview/core/types'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  FieldList,
  ItemId,
  ItemList,
  ItemPlacement,
  Section,
  SectionId,
  SectionList,
  ViewRecords,
  ViewSummaries
} from '@dataview/engine/contracts/shared'
import type {
  EntityDelta
} from '@shared/delta'
import type {
  ProjectionFamilySnapshot
} from '@shared/projection'

const SNAPSHOT_KEYS = [
  'view',
  'query',
  'records',
  'sections',
  'items',
  'fields',
  'table',
  'gallery',
  'kanban',
  'summaries'
] as const satisfies readonly (keyof ViewState)[]

const publishViewRecords = (input: {
  state: QueryPhaseState
  previous?: ViewRecords
}): ViewRecords => {
  const matched = input.state.matched.read.ids()
  const ordered = input.state.ordered.read.ids()
  const visible = input.state.visible.read.ids()

  if (
    input.previous
    && input.previous.matched === matched
    && input.previous.ordered === ordered
    && input.previous.visible === visible
  ) {
    return input.previous
  }

  return {
    matched,
    ordered,
    visible
  }
}

const buildFieldFamily = (
  fields?: FieldList
): ProjectionFamilySnapshot<FieldId, Field> => ({
  ids: fields?.ids ?? [],
  byId: fields
    ? new Map(fields.all.map((field) => [field.id, field] as const))
    : new Map()
})

const buildSectionFamily = (
  sections?: SectionList
): ProjectionFamilySnapshot<SectionId, Section> => ({
  ids: sections?.ids ?? [],
  byId: sections
    ? new Map(sections.all.map((section) => [section.id, section] as const))
    : new Map()
})

const buildItemFamily = (
  items?: ItemList
): ProjectionFamilySnapshot<ItemId, ItemPlacement> => ({
  ids: items?.ids ?? [],
  byId: items
    ? new Map(items.ids.flatMap((itemId) => {
        const placement = items.read.placement(itemId)
        return placement
          ? [[itemId, placement] as const]
          : []
      }))
    : new Map()
})

const buildSummaryFamily = (input: {
  sections?: SectionList
  summaries?: ViewSummaries
}): ProjectionFamilySnapshot<SectionId, CalculationCollection> => {
  if (!input.sections || !input.summaries) {
    return {
      ids: [],
      byId: new Map()
    }
  }

  const byId = new Map<SectionId, CalculationCollection>()
  input.sections.ids.forEach((sectionId) => {
    const summary = input.summaries?.get(sectionId)
    if (summary) {
      byId.set(sectionId, summary)
    }
  })

  return {
    ids: byId.size
      ? input.sections.ids.filter((sectionId) => byId.has(sectionId))
      : [],
    byId
  }
}

export const publishActiveView = (input: {
  frame: DataviewFrame
  active: DataviewActiveSpec
  plan: DataviewActivePlan
  query: QueryPhaseState
  membership: MembershipPhaseState
  summary: SummaryPhaseState
  previous: DataviewActiveState
}): {
  snapshot?: ViewState
  fields: ProjectionFamilySnapshot<FieldId, Field>
  sections: ProjectionFamilySnapshot<SectionId, Section>
  items: ProjectionFamilySnapshot<ItemId, ItemPlacement>
  summaries: ProjectionFamilySnapshot<SectionId, CalculationCollection>
  sectionDelta?: EntityDelta<SectionId>
  itemDelta?: EntityDelta<ItemId>
} => {
  const action = input.plan.publish.action
  const previous = input.previous.snapshot
  if (action === 'reuse') {
    return {
      snapshot: previous,
      fields: input.previous.fields,
      sections: input.previous.sections,
      items: input.previous.items,
      summaries: input.previous.summaries
    }
  }

  const canReusePublished = previous?.view.id === input.active.id
  if (!canReusePublished) {
    input.previous.itemIds.gc.clear()
  }
  const records = publishViewRecords({
    state: input.query,
    previous: canReusePublished
      ? previous?.records
      : undefined
  })
  const sections = publishSections({
    view: input.active.view,
    sections: input.membership,
    previousSections: canReusePublished
      ? input.previous.membership
      : undefined,
    itemIds: input.previous.itemIds,
    previous: canReusePublished && previous?.sections && previous?.items
      ? {
          sections: previous.sections,
          items: previous.items
        }
      : undefined
  })
  const summaries = publishSummaries({
    summary: input.summary,
    previousSummary: canReusePublished
      ? input.previous.summary
      : undefined,
    previous: canReusePublished
      ? previous?.summaries
      : undefined,
    reader: input.frame.query,
    view: input.active.view
  })
  const base = publishViewBase({
    reader: input.frame.query,
    viewId: input.active.id,
    previous: canReusePublished && previous
      ? {
          view: previous.view,
          query: previous.query,
          fields: previous.fields,
          table: previous.table,
          gallery: previous.gallery,
          kanban: previous.kanban
        }
      : undefined
  })
  const nextSnapshot = base.view && base.query && base.fields && base.table && base.gallery && base.kanban
    ? {
        view: base.view,
        query: base.query,
        records,
        sections: sections.sections,
        items: sections.items,
        fields: base.fields,
        table: base.table,
        gallery: base.gallery,
        kanban: base.kanban,
        summaries
      } satisfies ViewState
    : undefined
  const fields = buildFieldFamily(base.fields)
  const sectionFamily = buildSectionFamily(sections.sections)
  const itemFamily = buildItemFamily(sections.items)
  const summaryFamily = buildSummaryFamily({
    sections: sections.sections,
    summaries
  })
  const published = nextSnapshot
    ? publishStruct({
        previous,
        next: nextSnapshot,
        keys: SNAPSHOT_KEYS
      })
    : undefined
  const snapshot = published?.value

  return {
    snapshot,
    fields,
    sections: sectionFamily,
    items: itemFamily,
    summaries: summaryFamily,
    ...(sections.delta?.sections
      ? {
          sectionDelta: sections.delta.sections
        }
      : {}),
    ...(sections.delta?.items
      ? {
          itemDelta: sections.delta.items
        }
      : {})
  }
}
