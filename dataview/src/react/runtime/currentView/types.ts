import type {
  PropertyId,
  RecordId
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  Appearance,
  AppearanceList,
  FieldId,
  Plan,
  Placement,
  PropertyList,
  RecordFieldRef,
  Schema,
  Section,
  SectionKey,
  ViewFieldRef,
  ViewProjection
} from '@dataview/engine/projection/view'

export type {
  AppearanceId,
  Appearance,
  AppearanceList,
  FieldId,
  Plan,
  Placement,
  PropertyList,
  RecordFieldRef,
  Schema,
  Section,
  SectionKey,
  ViewFieldRef
} from '@dataview/engine/projection/view'

export interface CreateInSectionInput {
  title?: string
  values?: Partial<Record<PropertyId, unknown>>
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
