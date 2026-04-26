import type { EntityDelta as SharedEntityDelta } from '@shared/delta'
import type {
  CustomFieldId,
  FieldId,
  RecordId,
  ValueRef,
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemId,
  SectionId
} from '@dataview/engine/contracts/shared'

export type { EntityDelta } from '@shared/delta'

export interface DocumentDelta {
  reset?: true
  meta?: true
  records?: SharedEntityDelta<RecordId>
  values?: SharedEntityDelta<ValueRef>
  fields?: SharedEntityDelta<FieldId>
  schemaFields?: SharedEntityDelta<CustomFieldId>
  views?: SharedEntityDelta<ViewId>
}

export type DocDelta = DocumentDelta

export interface ActiveDelta {
  reset?: true
  view?: true
  query?: true
  table?: true
  gallery?: true
  kanban?: true
  records?: {
    matched?: true
    ordered?: true
    visible?: true
  }
  fields?: SharedEntityDelta<FieldId>
  sections?: SharedEntityDelta<SectionId>
  items?: SharedEntityDelta<ItemId>
  summaries?: SharedEntityDelta<SectionId>
}

export interface DataviewDelta {
  doc?: DocDelta
  active?: ActiveDelta
}

export type EngineDelta = DataviewDelta
