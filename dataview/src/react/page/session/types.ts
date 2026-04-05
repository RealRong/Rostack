import type {
  PropertyId,
  ViewId
} from '@dataview/core/contracts'

export type QueryBarEntry =
  | {
      kind: 'addFilter'
    }
  | {
      kind: 'addSort'
    }
  | {
      kind: 'filter'
      propertyId: PropertyId
    }
  | {
      kind: 'sort'
    }

export type SettingsRoute =
  | { kind: 'root', focusTarget?: 'viewName' }
  | { kind: 'layout' }
  | { kind: 'group' }
  | { kind: 'viewProperties' }
  | { kind: 'propertyList' }
  | { kind: 'propertyCreate' }
  | { kind: 'propertySchema', propertyId: PropertyId }
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

export interface PageSessionInput extends Partial<Omit<PageSessionState, 'query' | 'settings'>> {
  query?: Partial<QueryBarState>
  settings?: Partial<SettingsState>
}

export interface PageSessionState {
  activeViewId?: ViewId
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
  setActiveViewId(viewId?: ViewId): void
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
