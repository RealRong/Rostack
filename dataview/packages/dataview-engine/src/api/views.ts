import type {
  ViewId
} from '@dataview/core/contracts'
import {
  document as documentApi
} from '@dataview/core/document'
import { string } from '@shared/core'
import { view as viewApi } from '@dataview/core/view'
import type {
  Engine,
  ViewsApi
} from '@dataview/engine/contracts/api'
import type {
  ExecuteResult,
} from '@dataview/engine/types/intent'

const readId = (
  result: ExecuteResult
): string | undefined => result.ok
  && typeof result.data === 'object'
  && result.data !== null
  && 'id' in result.data
    ? String(result.data.id)
    : undefined

export const createViewsApi = (
  engine: Pick<Engine, 'doc' | 'execute'>
): ViewsApi => {
  const readViews = () => documentApi.views.ids(engine.doc())
    .flatMap((viewId) => {
      const view = documentApi.views.get(engine.doc(), viewId)
      return view ? [view] : []
    })

  return {
    list: readViews,
    get: (id) => documentApi.views.get(engine.doc(), id),
    open: (id) => {
      engine.execute({
        type: 'view.open',
        id
      })
    },
    create: (input) => {
      const preferredName = string.trimToUndefined(input.name)
      if (!preferredName) {
        return undefined
      }

      const result = engine.execute({
        type: 'view.create',
        input: {
          name: preferredName,
          type: input.type
        }
      })

      return readId(result)
    },
    rename: (id: ViewId, name: string) => {
      const nextName = string.trimToUndefined(name)
      if (!nextName) {
        return
      }

      engine.execute({
        type: 'view.patch',
        id,
        patch: {
          name: nextName
        }
      })
    },
    duplicate: (id) => {
      const sourceView = documentApi.views.get(engine.doc(), id)
      if (!sourceView) {
        return undefined
      }

      const result = engine.execute({
        type: 'view.create',
        input: viewApi.duplicate.input(sourceView)
      })

      return readId(result)
    },
    remove: (id) => {
      engine.execute({
        type: 'view.remove',
        id
      })
    }
  }
}
