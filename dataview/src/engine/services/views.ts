import type {
  ViewType,
  ViewId
} from '@dataview/core/contracts'
import { getDocumentViews } from '@dataview/core/document'
import type {
  Engine,
  ViewsEngineApi
} from '../types'

export const createViewsEngineApi = (options: {
  engine: Pick<Engine, 'read' | 'command'>
}): ViewsEngineApi => {
  const readViews = () => getDocumentViews(options.engine.read.document.get())

  return {
    list: readViews,
    get: viewId => options.engine.read.view.get(viewId),
    create: input => {
      const name = input.name.trim()
      if (!name) {
        return undefined
      }

      const result = options.engine.command({
        type: 'view.create',
        input: {
          name,
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
        type: 'view.rename',
        viewId,
        name: nextName
      })
    },
    duplicate: viewId => {
      const result = options.engine.command({
        type: 'view.duplicate',
        viewId
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
