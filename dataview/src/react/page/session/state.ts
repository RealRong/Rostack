import {
  ROOT_SETTINGS_ROUTE,
  cloneSettingsRoute,
  equalSettingsRoute
} from './settings'
import type {
  BlockingSurfaceState,
  PageInteractionState,
  PageSessionInput,
  PageSessionState,
  QueryBarEntry,
  SettingsState
} from './types'

const EMPTY_INTERACTION_STATE: PageInteractionState = {
  blockingSurfaces: []
}

export const cloneQueryBarEntry = (
  entry: QueryBarEntry | null | undefined
): QueryBarEntry | null => {
  if (!entry) {
    return null
  }

  return entry.kind === 'filter'
    ? {
        kind: 'filter',
        propertyId: entry.propertyId
      }
    : entry.kind === 'addFilter'
      ? { kind: 'addFilter' }
      : entry.kind === 'addSort'
        ? { kind: 'addSort' }
        : { kind: 'sort' }
}

const cloneSettingsState = (
  settings: Partial<SettingsState> | undefined
): SettingsState => ({
  visible: settings?.visible ?? false,
  route: cloneSettingsRoute(settings?.route ?? ROOT_SETTINGS_ROUTE)
})

const cloneInteractionState = (
  interaction: Partial<PageInteractionState> | PageInteractionState | undefined
): PageInteractionState => ({
  blockingSurfaces: interaction?.blockingSurfaces?.map(surface => ({
    ...surface
  })) ?? EMPTY_INTERACTION_STATE.blockingSurfaces
})

const equalQueryBarEntry = (
  left: QueryBarEntry | null,
  right: QueryBarEntry | null
) => {
  if (!left || !right) {
    return left === right
  }

  return left.kind === right.kind
    && (
      left.kind !== 'filter'
      || right.kind !== 'filter'
      || left.propertyId === right.propertyId
    )
}

const equalSettingsState = (
  left: SettingsState,
  right: SettingsState
) => (
  left.visible === right.visible
  && equalSettingsRoute(left.route, right.route)
)

export const equalBlockingSurface = (
  left: BlockingSurfaceState,
  right: BlockingSurfaceState
) => (
  left.id === right.id
  && left.source === right.source
  && left.backdrop === right.backdrop
  && left.dismissOnBackdropPress === right.dismissOnBackdropPress
)

const equalInteractionState = (
  left: PageInteractionState,
  right: PageInteractionState
) => (
  left.blockingSurfaces.length === right.blockingSurfaces.length
  && left.blockingSurfaces.every((surface, index) => (
    equalBlockingSurface(surface, right.blockingSurfaces[index] as BlockingSurfaceState)
  ))
)

export const equalPageSessionState = (
  left: PageSessionState,
  right: PageSessionState
) => (
  left.activeViewId === right.activeViewId
  && left.query.visible === right.query.visible
  && equalQueryBarEntry(left.query.route, right.query.route)
  && equalSettingsState(left.settings, right.settings)
  && equalInteractionState(left.interaction, right.interaction)
)

export const createDefaultPageSessionState = (
  input?: PageSessionInput
): PageSessionState => ({
  activeViewId: input?.activeViewId,
  query: {
    visible: input?.query?.visible ?? true,
    route: cloneQueryBarEntry(input?.query?.route)
  },
  settings: cloneSettingsState(input?.settings),
  interaction: cloneInteractionState(input?.interaction)
})
