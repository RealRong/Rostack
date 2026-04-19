import type { Draft, DraftKind, Writer } from '@whiteboard/engine/types/write'
import type { Command, CommandOutput } from '@whiteboard/engine/types/command'
import type { BoardConfig } from '@whiteboard/engine/types/instance'
import { assertDocument } from '@whiteboard/core/document'
import {
  type Batch,
  type CoreRegistries,
  type Document,
  type EdgeId,
  type GroupId,
  type MindmapId,
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
import { DEFAULT_HISTORY_CONFIG } from '@whiteboard/engine/config'
import { RESET_INVALIDATION } from '@whiteboard/engine/read/invalidation'
import { cancelled, failure } from '@whiteboard/engine/result'
import { normalizeDocument } from '@whiteboard/engine/document/normalize'
import { planCommand } from '@whiteboard/engine/write/planner'

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

const createReplaceChanges = (): import('@whiteboard/core/types').ChangeSet => ({
  document: true,
  background: true,
  canvasOrder: true,
  nodes: {
    add: new Set(),
    update: new Set(),
    delete: new Set()
  },
  edges: {
    add: new Set(),
    update: new Set(),
    delete: new Set()
  },
  groups: {
    add: new Set(),
    update: new Set(),
    delete: new Set()
  },
  mindmaps: {
    add: new Set(),
    update: new Set(),
    delete: new Set()
  }
})

const createResetImpact = (): import('@whiteboard/core/kernel').KernelReadImpact => ({
  reset: true,
  document: true,
  node: {
    ids: [],
    geometry: true,
    list: true,
    value: true
  },
  edge: {
    ids: [],
    nodeIds: [],
    geometry: true,
    list: true,
    value: true
  }
})

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
    edgeRoutePoint: (): string => createId('edge_point'),
    group: (): GroupId => createId('group'),
    mindmap: (): MindmapId => createId('mindmap'),
    mindmapNode: (): NodeId => createId('mnode')
  }

  const toOperationsDraft = <T>(
    reduced: Extract<KernelReduceResult, { ok: true }>,
    operations: readonly Operation[],
    kind: Exclude<DraftKind, 'replace'>,
    value: T
  ): Draft<T> => ({
    ok: true,
    kind,
    doc: reduced.data.doc,
    operations,
    changes: reduced.data.changes,
    invalidation: reduced.data.invalidation,
    value,
    inverse: reduced.data.inverse,
    impact: reduced.data.impact
  })

  const toReplaceDraft = (
    doc: Document
  ): Draft => ({
    ok: true,
    kind: 'replace',
    doc,
    operations: [],
    value: undefined,
    changes: createReplaceChanges(),
    invalidation: RESET_INVALIDATION,
    inverse: [],
    impact: createResetImpact()
  })

  const reduceToDraft = <T>(
    doc: Document,
    operations: readonly Operation[],
    origin: Origin,
    kind: Exclude<DraftKind, 'replace'>,
    value: T
  ): Draft<T> => {
    const reduced = reduceOperations(doc, operations, {
      now: readNow,
      origin
    })
    if (!reduced.ok) {
      return failure(
        reduced.error.code,
        reduced.error.message
      )
    }

    const normalized = normalizeDocument(reduced.data.doc, config)

    return toOperationsDraft(
      {
        ...reduced,
        data: {
          ...reduced.data,
          doc: normalized
        }
      },
      operations,
      kind,
      value
    )
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

  const execute = <C extends Command>(
    command: C,
    origin: Origin = 'user'
  ): Draft<CommandOutput<C>> => {
    const doc = document.get()
    const planned = planCommand(command, {
      doc,
      registries,
      ids,
      nodeSize: config.nodeSize
    })
    if (!planned.ok) {
      return failure(planned.error.code, planned.error.message)
    }

    return reduceToDraft(
      doc,
      planned.data.operations,
      origin,
      'apply',
      planned.data.output
    ) as Draft<CommandOutput<C>>
  }

  const apply = (
    batch: Batch,
    origin: Origin = 'user'
  ): Draft<unknown> => reduceToDraft(
    document.get(),
    batch.ops,
    origin,
    'apply',
    batch.output
  )

  const capture = (input: {
    operations: readonly Operation[]
    inverse?: readonly Operation[]
    origin?: Origin
  }) => {
    if (!input.inverse) {
      return
    }

    history.capture({
      forward: input.operations,
      inverse: input.inverse,
      origin: input.origin
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
    execute,
    apply,
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
