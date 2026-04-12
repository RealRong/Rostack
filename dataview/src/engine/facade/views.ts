import type {
  Action,
  ViewId
} from '@dataview/core/contracts'
import {
  read,
  trimToUndefined
} from '@shared/core'
import {
  createDuplicateViewInput
} from '@dataview/core/view'
import type {
  EngineReadApi,
  ViewsEngineApi
} from '../api/public'
import type { ActionResult } from '../api/public/command'

export const createViewsEngineApi = (options: {
  read: EngineReadApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}): ViewsEngineApi => {
  const readViews = () => read(options.read.views)

  return {
    list: readViews,
    get: viewId => read(options.read.view, viewId),
    open: viewId => {
      options.dispatch({
        type: 'view.open',
        viewId
      })
    },
    create: input => {
      const preferredName = trimToUndefined(input.name)
      if (!preferredName) {
        return undefined
      }

      const result = options.dispatch({
        type: 'view.create',
        input: {
          name: preferredName,
          type: input.type
        }
      })
      return result.created?.views?.[0]
    },
    rename: (viewId: ViewId, name: string) => {
      const nextName = trimToUndefined(name)
      if (!nextName) {
        return
      }

      options.dispatch({
        type: 'view.patch',
        viewId,
        patch: {
          name: nextName
        }
      })
    },
    duplicate: viewId => {
      const sourceView = read(options.read.view, viewId)
      if (!sourceView) {
        return undefined
      }

      const result = options.dispatch({
        type: 'view.create',
        input: createDuplicateViewInput(sourceView)
      })
      return result.created?.views?.[0]
    },
    remove: viewId => {
      options.dispatch({
        type: 'view.remove',
        viewId
      })
    }
  }
}
