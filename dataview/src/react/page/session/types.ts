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
  | { kind: 'root' }
  | { kind: 'layout' }
  | { kind: 'group' }
  | { kind: 'viewProperties' }
  | { kind: 'propertyList' }
  | { kind: 'propertyCreate' }
  | { kind: 'propertyEdit', propertyId: PropertyId }
  | { kind: 'filter' }
  | { kind: 'sort' }

export type BlockingSurfaceBackdrop = 'transparent' | 'dim'

export interface BlockingSurfaceState {
  id: string
  source: string
  backdrop: BlockingSurfaceBackdrop
  dismissOnBackdropPress: boolean
}

export interface OpenBlockingSurfaceInput extends BlockingSurfaceState {
  onDismiss?: () => void
}

export interface PageInteractionState {
  blockingSurfaces: readonly BlockingSurfaceState[]
}

export interface QueryBarState {
  visible: boolean
  route: QueryBarEntry | null
}

export interface SettingsState {
  visible: boolean
  route: SettingsRoute
}

export interface PageSessionInput extends Partial<Omit<PageSessionState, 'query' | 'settings' | 'interaction'>> {
  query?: Partial<QueryBarState>
  settings?: Partial<SettingsState>
  interaction?: Partial<PageInteractionState>
}

export interface PageSessionState {
  activeViewId?: ViewId
  query: QueryBarState
  settings: SettingsState
  interaction: PageInteractionState
}

export type PageLock =
  | null
  | 'page-surface'
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
  surface: {
    set(input: OpenBlockingSurfaceInput): void
    clear(id: string): void
    dismissTop(): void
  }
}
