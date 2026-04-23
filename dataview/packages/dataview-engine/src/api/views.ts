import type {
  Action,
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  document as documentApi
} from '@dataview/core/document'
import { string } from '@shared/core'
import { view as viewApi } from '@dataview/core/view'
import type {
  ViewsApi
} from '@dataview/engine/contracts/api'
import type {
  ActionResult
} from '@dataview/engine/contracts/result'

export const createViewsApi = (options: {
  document: () => DataDoc
  dispatch: (action: Action | readonly Action[]) => ActionResult
}): ViewsApi => {
  const readViews = () => documentApi.views.ids(options.document())
    .flatMap(viewId => {
      const view = documentApi.views.get(options.document(), viewId)
      return view ? [view] : []
    })

  return {
    list: readViews,
    get: id => documentApi.views.get(options.document(), id),
    open: id => {
      options.dispatch({
        type: 'view.open',
        id
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
    rename: (id: ViewId, name: string) => {
      const nextName = string.trimToUndefined(name)
      if (!nextName) {
        return
      }

      options.dispatch({
        type: 'view.patch',
        id,
        patch: {
          name: nextName
        }
      })
    },
    duplicate: id => {
      const sourceView = documentApi.views.get(options.document(), id)
      if (!sourceView) {
        return undefined
      }

      const result = options.dispatch({
        type: 'view.create',
        input: viewApi.duplicate.input(sourceView)
      })
      return result.created?.views?.[0]
    },
    remove: id => {
      options.dispatch({
        type: 'view.remove',
        id
      })
    }
  }
}
