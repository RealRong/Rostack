import type {
  DataDoc,
  Intent as CoreIntent,
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

export const createViewsApi = (options: {
  document: () => DataDoc
  execute: (intent: CoreIntent) => ExecuteResult
}): ViewsApi => {
  const readViews = () => documentApi.views.ids(options.document())
    .flatMap((viewId) => {
      const view = documentApi.views.get(options.document(), viewId)
      return view ? [view] : []
    })

  return {
    list: readViews,
    get: (id) => documentApi.views.get(options.document(), id),
    open: (id) => {
      options.execute({
        type: 'view.open',
        id
      })
    },
    create: (input) => {
      const preferredName = string.trimToUndefined(input.name)
      if (!preferredName) {
        return undefined
      }

      const result = options.execute({
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

      options.execute({
        type: 'view.patch',
        id,
        patch: {
          name: nextName
        }
      })
    },
    duplicate: (id) => {
      const sourceView = documentApi.views.get(options.document(), id)
      if (!sourceView) {
        return undefined
      }

      const result = options.execute({
        type: 'view.create',
        input: viewApi.duplicate.input(sourceView)
      })

      return readId(result)
    },
    remove: (id) => {
      options.execute({
        type: 'view.remove',
        id
      })
    }
  }
}
