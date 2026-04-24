import type {
  DataDoc,
  Intent as CoreIntent
} from '@dataview/core/contracts'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import {
  document
} from '@dataview/core/document'
import {
  MutationEngine
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
import { createDataviewMutationSpec } from '@dataview/engine/mutation'
import type {
  DataviewPublishState
} from '@dataview/engine/mutation'
import { createPerformanceRuntime } from '@dataview/engine/runtime/performance'
import type {
  BatchExecuteResult,
  ExecuteResult,
} from '@dataview/engine/types/intent'

const toCurrent = (current: {
  rev: number
  doc: DataDoc
  publish?: DataviewPublishState
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
  const mutationEngine = new MutationEngine({
    doc: document.clone(options.document),
    spec: createDataviewMutationSpec({
      history: options.history,
      performance
    })
  })

  const execute = (
    intent: CoreIntent
  ): ExecuteResult => mutationEngine.execute(intent) as ExecuteResult

  const executeMany = (
    intents: readonly CoreIntent[]
  ): BatchExecuteResult => mutationEngine.executeMany(intents) as BatchExecuteResult

  const readDocument = () => mutationEngine.current().doc
  const readActiveState = () => mutationEngine.current().publish?.active
  const fields = createFieldsApi({
    document: readDocument,
    execute
  })
  const records = createRecordsApi({
    document: readDocument,
    execute
  })
  const active = createActiveViewApi({
    document: readDocument,
    active: readActiveState,
    execute,
    executeMany
  })
  const views = createViewsApi({
    document: readDocument,
    execute
  })

  return {
    writes: mutationEngine.writes,
    history: mutationEngine.history,
    active,
    views,
    fields,
    records,
    performance: performance.api,
    current: () => toCurrent(mutationEngine.current()),
    subscribe: (listener) => mutationEngine.subscribe((current) => {
      listener(toCurrent(current))
    }),
    doc: () => mutationEngine.doc(),
    load: (nextDocument: DataDoc) => {
      mutationEngine.load(document.clone(nextDocument))
    },
    execute: ((intent, executeOptions) => (
      mutationEngine.execute(intent, executeOptions)
    )) as Engine['execute'],
    executeMany: ((intents, executeOptions) => (
      mutationEngine.executeMany(intents, executeOptions)
    )) as Engine['executeMany'],
    apply: ((operations: readonly DocumentOperation[], applyOptions) => (
      mutationEngine.apply(operations, applyOptions)
    )) as Engine['apply']
  }
}
