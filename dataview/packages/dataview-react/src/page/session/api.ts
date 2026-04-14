import {
  type ValueStore
} from '@shared/core'
import {
  createControllerStore
} from '@dataview/react/runtime/store'
import {
  ROOT_SETTINGS_ROUTE,
  cloneSettingsRoute,
  parentSettingsRoute
} from '@dataview/react/page/session/settings'
import {
  cloneQueryBarEntry,
  createDefaultPageSessionState,
  equalPageSessionState
} from '@dataview/react/page/session/state'
import type {
  PageSessionApi,
  PageSessionInput,
  PageSessionState,
  QueryBarEntry
} from '@dataview/react/page/session/types'

export interface PageSessionController extends PageSessionApi {
  store: ValueStore<PageSessionState>
  dispose: () => void
}

export const createPageSessionApi = (
  initial?: PageSessionInput
): PageSessionController => {
  const {
    store
  } = createControllerStore<PageSessionState>({
    initial: createDefaultPageSessionState(initial),
    isEqual: equalPageSessionState
  })

  const api: PageSessionApi = {
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
    }
  }

  return {
    ...api,
    store,
    dispose: () => {}
  }
}
