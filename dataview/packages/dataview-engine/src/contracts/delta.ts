import type { EntityDelta as SharedEntityDelta } from '@shared/core'
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

export type { EntityDelta } from '@shared/core'

export interface DocDelta {
  reset?: true
  meta?: true
  records?: SharedEntityDelta<RecordId>
  values?: SharedEntityDelta<ValueRef>
  fields?: SharedEntityDelta<FieldId>
  schema?: {
    fields?: SharedEntityDelta<CustomFieldId>
  }
  views?: SharedEntityDelta<ViewId>
}

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

export interface EngineDelta {
  doc?: DocDelta
  active?: ActiveDelta
}
