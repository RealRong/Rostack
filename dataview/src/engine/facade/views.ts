import type {
  ViewId
} from '@dataview/core/contracts'
import {
  createDuplicateViewPreferredName
} from '@dataview/core/view'
import type {
  Engine,
  ViewsEngineApi
} from '../types'

export const createViewsEngineApi = (options: {
  engine: Pick<Engine, 'read' | 'command'>
}): ViewsEngineApi => {
  const readViews = () => options.engine.read.views.get()

  return {
    list: readViews,
    get: viewId => options.engine.read.view.get(viewId),
    create: input => {
      const preferredName = input.name.trim()
      if (!preferredName) {
        return undefined
      }

      const result = options.engine.command({
        type: 'view.create',
        input: {
          name: preferredName,
          type: input.type
        }
      })
      return result.created?.views?.[0]
    },
    rename: (viewId: ViewId, name: string) => {
      const nextName = name.trim()
      if (!nextName) {
        return
      }

      options.engine.command({
        type: 'view.patch',
        viewId,
        patch: {
          name: nextName
        }
      })
    },
    duplicate: viewId => {
      const sourceView = options.engine.read.view.get(viewId)
      if (!sourceView) {
        return undefined
      }

      const result = options.engine.command({
        type: 'view.create',
        input: {
          name: createDuplicateViewPreferredName(sourceView.name),
          type: sourceView.type,
          search: sourceView.search,
          filter: sourceView.filter,
          sort: sourceView.sort,
          ...(sourceView.group
            ? { group: sourceView.group }
            : {}),
          calc: sourceView.calc,
          display: sourceView.display,
          options: sourceView.options,
          orders: sourceView.orders
        }
      })
      return result.created?.views?.[0]
    },
    remove: viewId => {
      options.engine.command({
        type: 'view.remove',
        viewId
      })
    }
  }
}
