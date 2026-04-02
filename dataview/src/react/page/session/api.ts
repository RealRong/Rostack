import {
  createValueStore,
  type ValueStore
} from '@/runtime/store'
import {
  ROOT_SETTINGS_ROUTE,
  cloneSettingsRoute,
  parentSettingsRoute
} from './settings'
import {
  cloneQueryBarEntry,
  createDefaultPageSessionState,
  equalBlockingSurface,
  equalPageSessionState
} from './state'
import type {
  BlockingSurfaceState,
  OpenBlockingSurfaceInput,
  PageSessionApi,
  PageSessionInput,
  PageSessionState,
  QueryBarEntry
} from './types'

export interface PageSessionController extends PageSessionApi {
  store: ValueStore<PageSessionState>
  dispose: () => void
}

export const createPageSessionApi = (
  initial?: PageSessionInput
): PageSessionController => {
  const store = createValueStore<PageSessionState>({
    initial: createDefaultPageSessionState(initial),
    isEqual: equalPageSessionState
  })
  const blockingSurfaceHandlers = new Map<string, {
    onDismiss?: () => void
  }>()

  const setSurface = (next: OpenBlockingSurfaceInput) => {
    if (next.onDismiss) {
      blockingSurfaceHandlers.set(next.id, {
        onDismiss: next.onDismiss
      })
    } else {
      blockingSurfaceHandlers.delete(next.id)
    }

    store.update(prev => {
      const nextSurface: BlockingSurfaceState = {
        id: next.id,
        source: next.source,
        backdrop: next.backdrop,
        dismissOnBackdropPress: next.dismissOnBackdropPress
      }
      const index = prev.interaction.blockingSurfaces.findIndex(surface => surface.id === next.id)
      if (index === -1) {
        return {
          ...prev,
          interaction: {
            blockingSurfaces: [...prev.interaction.blockingSurfaces, nextSurface]
          }
        }
      }

      if (equalBlockingSurface(prev.interaction.blockingSurfaces[index] as BlockingSurfaceState, nextSurface)) {
        return prev
      }

      const nextBlockingSurfaces = [...prev.interaction.blockingSurfaces]
      nextBlockingSurfaces.splice(index, 1, nextSurface)
      return {
        ...prev,
        interaction: {
          blockingSurfaces: nextBlockingSurfaces
        }
      }
    })
  }

  const clearSurface = (id: string) => {
    blockingSurfaceHandlers.delete(id)
    store.update(prev => {
      const nextBlockingSurfaces = prev.interaction.blockingSurfaces.filter(surface => surface.id !== id)
      if (nextBlockingSurfaces.length === prev.interaction.blockingSurfaces.length) {
        return prev
      }

      return {
        ...prev,
        interaction: {
          blockingSurfaces: nextBlockingSurfaces
        }
      }
    })
  }

  const api: PageSessionApi = {
    setActiveViewId: viewId => {
      const current = store.get()
      if (
        current.activeViewId === viewId
        && !current.query.route
      ) {
        return
      }

      store.update(prev => ({
        ...prev,
        activeViewId: viewId,
        query: prev.query.route
          ? {
              ...prev.query,
              route: null
            }
          : prev.query
      }))
    },
    query: {
      show: () => {
        store.update(prev => (
          prev.query.visible
            ? prev
            : {
                ...prev,
                query: {
                  ...prev.query,
                  visible: true
                }
              }
        ))
      },
      hide: () => {
        store.update(prev => (
          prev.query.visible || prev.query.route
            ? {
                ...prev,
                query: {
                  visible: false,
                  route: null
                }
              }
            : prev
        ))
      },
      open: (route: QueryBarEntry) => {
        store.update(prev => ({
          ...prev,
          query: {
            visible: true,
            route: cloneQueryBarEntry(route)
          }
        }))
      },
      close: () => {
        store.update(prev => (
          prev.query.route
            ? {
                ...prev,
                query: {
                  ...prev.query,
                  route: null
                }
              }
            : prev
        ))
      }
    },
    settings: {
      open: route => {
        store.update(prev => ({
          ...prev,
          settings: {
            visible: true,
            route: cloneSettingsRoute(route ?? ROOT_SETTINGS_ROUTE)
          }
        }))
      },
      close: () => {
        store.update(prev => (
          prev.settings.visible
            ? {
                ...prev,
                settings: {
                  ...prev.settings,
                  visible: false
                }
              }
            : prev
        ))
      },
      back: () => {
        store.update(prev => ({
          ...prev,
          settings: {
            ...prev.settings,
            route: parentSettingsRoute(prev.settings.route)
          }
        }))
      },
      push: route => {
        store.update(prev => ({
          ...prev,
          settings: {
            ...prev.settings,
            route: cloneSettingsRoute(route)
          }
        }))
      }
    },
    surface: {
      set: setSurface,
      clear: clearSurface,
      dismissTop: () => {
        const current = store.get().interaction.blockingSurfaces.at(-1)
        if (!current) {
          return
        }

        const handler = blockingSurfaceHandlers.get(current.id)
        if (handler?.onDismiss) {
          handler.onDismiss()
          return
        }

        clearSurface(current.id)
      }
    }
  }

  return {
    ...api,
    store,
    dispose: () => {
      blockingSurfaceHandlers.clear()
    }
  }
}
