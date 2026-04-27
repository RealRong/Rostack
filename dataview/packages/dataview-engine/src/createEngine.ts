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
  EngineFacadeHost,
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
  publish?: DataviewPublish
}): DataviewCurrent => ({
  rev: current.rev,
  doc: current.doc,
  ...(current.publish?.active || current.publish?.delta
    ? {
        publish: {
          ...(current.publish.active
            ? { active: current.publish.active }
            : {}),
          ...(current.publish.delta
            ? { delta: current.publish.delta }
            : {})
        }
      }
    : {})
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

  const baseEngine: EngineFacadeHost = {
    current: () => toCurrent(mutationEngine.current()),
    subscribe: (listener) => mutationEngine.subscribe((current) => {
      listener(toCurrent(current))
    }),
    doc: () => mutationEngine.doc(),
    replace: (nextDocument: DataDoc, replaceOptions?: MutationOptions) => (
      mutationEngine.replace(nextDocument, replaceOptions)
    ),
    load: (nextDocument: DataDoc) => {
      mutationEngine.load(nextDocument)
    },
    execute: (<I extends ExecuteInput>(
      input: I,
      executeOptions?: MutationOptions
    ): ExecuteResultOf<I> => (
      Array.isArray(input)
        ? mutationEngine.execute(input as readonly Intent[], executeOptions)
        : mutationEngine.execute(input as Intent, executeOptions)
    ) as ExecuteResultOf<I>),
    apply: ((operations: readonly DocumentOperation[], applyOptions) => (
      mutationEngine.apply(operations, applyOptions)
    ))
  }
  const engine = {
    ...baseEngine,
    commits: mutationEngine.commits,
    writes: mutationEngine.writes,
    history: mutationEngine.history,
    mutation: mutationEngine,
    performance: performance.api
  } as Omit<Engine, 'fields' | 'records' | 'views' | 'active'>

  return {
    ...engine,
    fields: createFieldsApi(engine),
    records: createRecordsApi(engine),
    views: createViewsApi(engine),
    active: createActiveViewApi(engine)
  }
}
