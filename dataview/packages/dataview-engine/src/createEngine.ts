import type {
  DataDoc
} from '@dataview/core/types'
import type {
  DocumentOperation
} from '@dataview/core/types/operations'
import type {
  DataviewMutationKey,
  DataviewTrace
} from '@dataview/core/operations'
import {
  CommandMutationEngine,
  type MutationOptions
} from '@shared/mutation'
import { createActiveViewApi } from '@dataview/engine/active/api/active'
import { createFieldsApi } from '@dataview/engine/api/fields'
import { createRecordsApi } from '@dataview/engine/api/records'
import { createViewsApi } from '@dataview/engine/api/views'
import type {
  CreateEngineOptions,
  Engine
} from '@dataview/engine/contracts/api'
import type {
  DataviewCurrent
} from '@dataview/engine/contracts/result'
import { createDataviewMutationKernel } from '@dataview/engine/mutation'
import type {
  DataviewMutationCache,
  DataviewPublish
} from '@dataview/engine/mutation'
import { createDataviewPublishSpec } from './mutation/publish'
import { createPerformanceRuntime } from '@dataview/engine/runtime/performance'
import type {
  DataviewIntentTable,
  ExecuteInput,
  ExecuteResultOf,
  Intent,
} from '@dataview/engine/types/intent'

const toCurrent = (current: {
  rev: number
  doc: DataDoc
  publish: DataviewPublish
}): DataviewCurrent => ({
  rev: current.rev,
  doc: current.doc,
  publish: current.publish
})

export const createEngine = (options: CreateEngineOptions): Engine => {
  const performance = createPerformanceRuntime(options.performance)
  const mutationEngine = new CommandMutationEngine<
    DataDoc,
    DataviewIntentTable,
    DocumentOperation,
    DataviewMutationKey,
    DataviewPublish,
    DataviewMutationCache,
    {
      trace: DataviewTrace
    }
  >({
    doc: options.document,
    spec: {
      ...createDataviewMutationKernel({
        history: options.history
      }),
      publish: createDataviewPublishSpec({
        performance
      })
    }
  })

  const engineBase = {
    current: () => toCurrent(mutationEngine.current()),
    subscribe: (listener: (current: DataviewCurrent) => void) => mutationEngine.subscribe((current) => {
      listener(toCurrent(current))
    }),
    doc: () => mutationEngine.doc(),
    replace: (nextDocument: DataDoc, replaceOptions?: MutationOptions) => (
      mutationEngine.replace(nextDocument, replaceOptions)
    ),
    execute: (<I extends ExecuteInput>(
      input: I,
      executeOptions?: MutationOptions
    ): ExecuteResultOf<I> => (
      Array.isArray(input)
        ? mutationEngine.execute(input as readonly Intent[], executeOptions)
        : mutationEngine.execute(input as Intent, executeOptions)
    ) as ExecuteResultOf<I>),
    apply: ((operations: readonly DocumentOperation[], applyOptions?: MutationOptions) => (
      mutationEngine.apply(operations, applyOptions)
    ))
  }
  const engineWithInfra = {
    ...engineBase,
    commits: mutationEngine.commits,
    history: mutationEngine.history,
    performance: performance.api
  } satisfies Pick<
    Engine,
    'current' | 'subscribe' | 'doc' | 'replace' | 'execute' | 'apply' | 'commits' | 'history' | 'performance'
  >

  return {
    ...engineWithInfra,
    fields: createFieldsApi(engineBase),
    records: createRecordsApi(engineBase),
    views: createViewsApi(engineBase),
    active: createActiveViewApi(engineBase)
  }
}
