import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import type {
  DataviewMutationKey,
  DataviewTrace
} from '@dataview/core/mutation'
import type {
  MutationPublishSpec
} from '@shared/mutation'
import type {
  PerformanceRuntime
} from '@dataview/engine/runtime/performance'
import type {
  DataviewMutationCache,
  DataviewPublish
} from './types'
import {
  createDataviewPublishProjectionRuntime
} from './projection/runtime'

export const createDataviewPublishSpec = (input?: {
  performance?: PerformanceRuntime
}): MutationPublishSpec<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  {
    trace: DataviewTrace
  },
  DataviewPublish,
  DataviewMutationCache
> => {
  let runtime = createDataviewPublishProjectionRuntime(input)

  return {
    init: (doc) => {
      runtime = createDataviewPublishProjectionRuntime(input)
      return runtime.reset(doc)
    },
    reduce: ({ prev, doc, commit }) =>
      runtime.update({
        prev,
        doc,
        commit
      })
  }
}
