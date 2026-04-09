import type { CustomFieldId } from '@dataview/core/contracts'

export type QueryBarEntry =
  | {
      kind: 'addFilter'
    }
  | {
      kind: 'addSort'
    }
  | {
      kind: 'filter'
      fieldId: CustomFieldId
    }
  | {
      kind: 'sort'
    }

export type SettingsRoute =
  | { kind: 'root', focusTarget?: 'viewName' }
  | { kind: 'layout' }
  | { kind: 'group' }
  | { kind: 'groupField' }
  | { kind: 'viewProperties' }
  | { kind: 'fieldList' }
  | { kind: 'fieldCreate' }
  | { kind: 'fieldSchema', fieldId: CustomFieldId }
  | { kind: 'filter' }
  | { kind: 'sort' }

export interface QueryBarState {
  visible: boolean
  route: QueryBarEntry | null
}

export interface SettingsState {
  visible: boolean
  route: SettingsRoute
}

export interface PageSessionInput {
  query?: Partial<QueryBarState>
  settings?: Partial<SettingsState>
}

export interface PageSessionState {
  query: QueryBarState
  settings: SettingsState
}

export type PageLock =
  | null
  | 'value-editor'

export interface ResolvedPageState extends PageSessionState {
  valueEditorOpen: boolean
  lock: PageLock
}

export interface PageSessionApi {
  query: {
    show(): void
    hide(): void
    open(route: QueryBarEntry): void
    close(): void
  }
  settings: {
    open(route?: SettingsRoute): void
    close(): void
    back(): void
    push(route: SettingsRoute): void
  }
}
