import type {
  Action,
  ViewId
} from '@dataview/core/contracts'
import { store, string } from '@shared/core'
import { view as viewApi } from '@dataview/core/view'
import type {
  ActionResult,
  DocumentSource,
  ViewsApi
} from '@dataview/engine/contracts'

export const createViewsApi = (options: {
  source: DocumentSource
  dispatch: (action: Action | readonly Action[]) => ActionResult
}): ViewsApi => {
  const readViews = () => store.read(options.source.views.ids)
    .flatMap(viewId => {
      const view = store.read(options.source.views, viewId)
      return view ? [view] : []
    })

  return {
    list: readViews,
    get: viewId => store.read(options.source.views, viewId),
    open: viewId => {
      options.dispatch({
        type: 'view.open',
        viewId
      })
    },
    create: input => {
      const preferredName = string.trimToUndefined(input.name)
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
      const nextName = string.trimToUndefined(name)
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
      const sourceView = store.read(options.source.views, viewId)
      if (!sourceView) {
        return undefined
      }

      const result = options.dispatch({
        type: 'view.create',
        input: viewApi.duplicate.input(sourceView)
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
