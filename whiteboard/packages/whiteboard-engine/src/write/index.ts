import type { WriteControl, WriteResult } from '@engine-types/write'
import type { WriteCommandMap, WriteDomain, WriteInput, WriteOutput } from '@engine-types/command'
import type { BoardConfig, EngineDocument } from '@engine-types/instance'
import {
  assertDocument,
  type CoreRegistries,
  type Document,
  type EdgeId,
  type GroupId,
  type MindmapId,
  type MindmapNodeId,
  type NodeId,
  type Operation,
  type Origin
} from '@whiteboard/core/types'
import {
  createHistory,
  reduceOperations,
  type KernelReduceResult
} from '@whiteboard/core/kernel'
import { createId } from '@whiteboard/core/utils'
import { DEFAULT_HISTORY_CONFIG } from '../config'
import { failure } from '../result'
import { translateWrite } from './translate'
import { createWritePipeline } from './normalize'
import { normalizeDocument } from '../document/normalize'

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export const createWrite = ({
  document: documentSource,
  config,
  registries
}: {
  document: EngineDocument
  config: BoardConfig
  registries: CoreRegistries
}): WriteControl => {
  const readNow = now
  const commitDocument = documentSource.commit
  const ids = {
    node: (): NodeId => createId('node'),
    edge: (): EdgeId => createId('edge'),
    group: (): GroupId => createId('group'),
    mindmap: (): MindmapId => createId('mindmap'),
    mindmapNode: (): MindmapNodeId => createId('mnode')
  }

  const reduce = (
    document: Document,
    operations: readonly Operation[],
    origin: Origin
  ): KernelReduceResult => reduceOperations(document, operations, {
    now: readNow,
    origin
  })

  const pipeline = createWritePipeline({
    reduce,
    nodeSize: config.nodeSize
  })

  const toOperationResult = <T>(
    reduced: Extract<KernelReduceResult, { ok: true }>,
    data: T
  ): WriteResult<T> => ({
    ok: true,
    data,
    kind: 'operations',
    doc: reduced.data.doc,
    changes: reduced.data.changes,
    inverse: reduced.data.inverse,
    impact: reduced.data.read
  })

  const toReplaceResult = (
    document: Document
  ): WriteResult => ({
    ok: true,
    data: undefined,
    kind: 'replace',
    doc: document,
    changes: {
      id: createId('change'),
      timestamp: readNow(),
      operations: [],
      origin: 'system'
    }
  })

  const runOperations = <T>(
    document: Document,
    operations: readonly Operation[],
    origin: Origin,
    data: T
  ): WriteResult<T> => {
    const reduced = pipeline.run(
      document,
      operations,
      origin
    )
    if (!reduced.ok) {
      return failure(
        reduced.error.code,
        reduced.error.message
      )
    }

    commitDocument(reduced.data.doc)
    return toOperationResult(reduced, data)
  }

  const runReplace = (
    document: Document
  ): WriteResult => {
    const nextDocument = normalizeDocument(
      assertDocument(document),
      config
    )
    commitDocument(nextDocument)
    return toReplaceResult(nextDocument)
  }

  const history = createHistory<Operation, Origin, WriteResult>({
    now: readNow,
    config: DEFAULT_HISTORY_CONFIG,
    replay: (operations) => {
      const result = runOperations(
        documentSource.get(),
        operations,
        'system',
        undefined
      )
      return result.ok ? result : false
    }
  })

  const clearOnSuccess = <T>(result: WriteResult<T>): WriteResult<T> => {
    if (result.ok) {
      history.clear()
    }
    return result
  }

  const capture = <T>(result: WriteResult<T>): WriteResult<T> => {
    if (
      result.ok
      && result.kind === 'operations'
      && result.inverse
    ) {
      history.capture({
        forward: result.changes.operations,
        inverse: result.inverse,
        origin: result.changes.origin
      })
    }

    return result
  }

  const apply = <
    D extends WriteDomain,
    C extends WriteCommandMap[D]
  >(payload: WriteInput<D, C>): WriteResult<WriteOutput<D, C>> => {
    const doc = documentSource.get()
    const translated = translateWrite(payload, {
      doc,
      config,
      registries,
      ids
    })
    if (!translated.ok) return translated

    return capture(
      runOperations(
        doc,
        translated.operations,
        payload.origin ?? 'user',
        translated.output
      )
    )
  }

  const applyOperations = (
    operations: readonly Operation[],
    origin: Origin = 'user'
  ): WriteResult =>
    capture(
      runOperations(
        documentSource.get(),
        operations,
        origin,
        undefined
      )
    )

  const replace = (document: Document) =>
    clearOnSuccess(runReplace(document))

  return {
    apply,
    applyOperations,
    replace,
    history: {
      get: history.get,
      subscribe: (listener) => history.subscribe(() => {
        listener()
      }),
      configure: history.configure,
      clear: history.clear,
      undo: history.undo,
      redo: history.redo
    }
  }
}
