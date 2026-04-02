import type {
  PropertyId,
  RecordId
} from '@dataview/core/contracts'
import type {
  ReadStore
} from '@dataview/runtime/store'
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

export interface Selection {
  ids: readonly AppearanceId[]
  anchor?: AppearanceId
  focus?: AppearanceId
}

export interface SelectionStore extends ReadStore<Selection> {
  set: (next: Selection) => void
}

export interface CreateInSectionInput {
  title?: string
  values?: Partial<Record<PropertyId, unknown>>
}

export interface Commands {
  selection: {
    all: () => void
    clear: () => void
    set: (
      ids: readonly AppearanceId[],
      options?: {
        anchor?: AppearanceId
        focus?: AppearanceId
      }
    ) => void
    toggle: (ids: readonly AppearanceId[]) => void
    extend: (to: AppearanceId) => void
  }
  move: {
    selection: (target: Placement) => void
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
  selection: ReadStore<Selection>
  commands: Commands
}
