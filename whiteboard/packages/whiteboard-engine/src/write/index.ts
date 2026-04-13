import type { Draft, DraftKind, Writer } from '#whiteboard-engine/write'
import type { CommandOutput, TranslateCommand } from '#whiteboard-engine/command'
import type { BoardConfig } from '#whiteboard-engine/instance'
import { assertDocument } from '@whiteboard/core/document'
import {
  type ChangeSet,
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
import { createId } from '@whiteboard/core/id'
import { DEFAULT_HISTORY_CONFIG } from '#whiteboard-engine/config'
import { cancelled, failure } from '#whiteboard-engine/result'
import { normalizeDocument } from '#whiteboard-engine/document/normalize'
import { createWritePipeline } from '#whiteboard-engine/write/normalize'
import { translateWrite } from '#whiteboard-engine/write/translate'

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

const withKind = <T>(
  draft: Draft<T>,
  kind: Exclude<DraftKind, 'replace'>
): Draft<T> => {
  if (!draft.ok || draft.kind === 'replace') {
    return draft
  }

  return {
    ...draft,
    kind
  }
}

export const createWrite = ({
  document,
  config,
  registries
}: {
  document: {
    get: () => Document
  }
  config: BoardConfig
  registries: CoreRegistries
}): Writer => {
  const readNow = now
  const ids = {
    node: (): NodeId => createId('node'),
    edge: (): EdgeId => createId('edge'),
    group: (): GroupId => createId('group'),
    mindmap: (): MindmapId => createId('mindmap'),
    mindmapNode: (): MindmapNodeId => createId('mnode')
  }

  const reduce = (
    doc: Document,
    operations: readonly Operation[],
    origin: Origin
  ): KernelReduceResult => reduceOperations(doc, operations, {
    now: readNow,
    origin
  })

  const pipeline = createWritePipeline({
    reduce,
    nodeSize: config.nodeSize
  })

  const toOperationsDraft = <T>(
    reduced: Extract<KernelReduceResult, { ok: true }>,
    kind: Exclude<DraftKind, 'replace'>,
    value: T
  ): Draft<T> => ({
    ok: true,
    kind,
    doc: reduced.data.doc,
    changes: reduced.data.changes,
    value,
    inverse: reduced.data.inverse,
    impact: reduced.data.read
  })

  const toReplaceDraft = (
    doc: Document
  ): Draft => ({
    ok: true,
    kind: 'replace',
    doc,
    value: undefined,
    changes: {
      id: createId('change'),
      timestamp: readNow(),
      operations: [],
      origin: 'system'
    }
  })

  const reduceToDraft = <T>(
    doc: Document,
    operations: readonly Operation[],
    origin: Origin,
    kind: Exclude<DraftKind, 'replace'>,
    value: T
  ): Draft<T> => {
    const reduced = pipeline.run(
      doc,
      operations,
      origin
    )
    if (!reduced.ok) {
      return failure(
        reduced.error.code,
        reduced.error.message
      )
    }

    return toOperationsDraft(reduced, kind, value)
  }

  const replace = (
    doc: Document
  ): Draft => toReplaceDraft(
    normalizeDocument(
      assertDocument(doc),
      config
    )
  )

  const history = createHistory<Operation, Origin, Draft>({
    now: readNow,
    config: DEFAULT_HISTORY_CONFIG,
    replay: (operations) => reduceToDraft(
      document.get(),
      operations,
      'system',
      'apply',
      undefined
    )
  })

  const run = <C extends TranslateCommand>(
    command: C,
    origin: Origin = 'user'
  ): Draft<CommandOutput<C>> => {
    const doc = document.get()
    const translated = translateWrite(command, {
      doc,
      config,
      registries,
      ids
    })
    if (!translated.ok) {
      return translated as Draft<CommandOutput<C>>
    }

    return reduceToDraft(
      doc,
      translated.operations,
      origin,
      'apply',
      translated.output
    ) as Draft<CommandOutput<C>>
  }

  const ops = (
    operations: readonly Operation[],
    origin: Origin = 'user'
  ): Draft => reduceToDraft(
    document.get(),
    operations,
    origin,
    'apply',
    undefined
  )

  const capture = (input: {
    changes: ChangeSet
    inverse?: readonly Operation[]
  }) => {
    if (!input.inverse) {
      return
    }

    history.capture({
      forward: input.changes.operations,
      inverse: input.inverse,
      origin: input.changes.origin
    })
  }

  const undo = (): Draft => {
    const draft = history.undo()
    if (!draft) {
      return cancelled('Nothing to undo.')
    }
    return withKind(draft, 'undo')
  }

  const redo = (): Draft => {
    const draft = history.redo()
    if (!draft) {
      return cancelled('Nothing to redo.')
    }
    return withKind(draft, 'redo')
  }

  return {
    run,
    ops,
    replace,
    undo,
    redo,
    history: {
      capture,
      configure: history.configure,
      get: history.get,
      subscribe: (listener) => history.subscribe(() => {
        listener()
      }),
      clear: history.clear
    }
  }
}
