import type {
  DataDoc
} from '@dataview/core/types'
import type {
  DocumentOperation
} from '@dataview/core/types/operations'
import type {
  DataviewTrace
} from '@dataview/core/operations'
import type {
  MutationFootprint,
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
  MutationFootprint,
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
