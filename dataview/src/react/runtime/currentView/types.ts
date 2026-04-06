import type {
  CustomFieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  Appearance,
  AppearanceList,
  CellRef,
  Plan,
  Placement,
  FieldList,
  RecordFieldRef,
  Schema,
  Section,
  SectionBucket,
  SectionKey,
  ViewFieldRef,
  ViewProjection
} from '@dataview/engine/projection/view'

export type {
  AppearanceId,
  Appearance,
  AppearanceList,
  CellRef,
  Plan,
  Placement,
  FieldList,
  RecordFieldRef,
  Schema,
  Section,
  SectionBucket,
  SectionKey,
  ViewFieldRef,
  ViewProjection
} from '@dataview/engine/projection/view'

export interface CreateInSectionInput {
  title?: string
  values?: Partial<Record<CustomFieldId, unknown>>
}

export interface Commands {
  move: {
    ids: (
      ids: readonly AppearanceId[],
      target: Placement
    ) => void
  }
  mutation: {
    create: (
      section: SectionKey,
      input?: CreateInSectionInput
    ) => RecordId | undefined
    remove: () => void
  }
}

export interface CurrentView extends ViewProjection {
  commands: Commands
}
