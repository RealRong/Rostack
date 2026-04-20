import type {
  CoreRegistries,
  Document,
  EdgeId,
  GroupId,
  MindmapId,
  NodeId,
  Operation,
  Origin
} from '@whiteboard/core/types'
import { reduceOperations } from '@whiteboard/core/kernel'
import { createId } from '@whiteboard/core/id'
import type { BoardConfig } from '@whiteboard/engine/types/instance'
import type { Command, CommandOutput } from '@whiteboard/engine/types/command'
import type { Draft } from '@whiteboard/engine/types/internal/draft'
import { failure } from '@whiteboard/engine/result'
import { createWriteDraft } from '@whiteboard/engine/write/draft'
import { compileCommand } from '@whiteboard/engine/write/compile'
import type { WriteRuntime } from '@whiteboard/engine/write/types'

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
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
}): WriteRuntime => {
  const ids = {
    node: (): NodeId => createId('node'),
    edge: (): EdgeId => createId('edge'),
    edgeLabel: (): string => createId('edge_label'),
    edgeRoutePoint: (): string => createId('edge_point'),
    group: (): GroupId => createId('group'),
    mindmap: (): MindmapId => createId('mindmap')
  }

  const reduceToDraft = <T>(
    doc: Document,
    ops: readonly Operation[],
    origin: Origin,
    value: T
  ): Draft<T> => {
    const reduced = reduceOperations(doc, ops, {
      now,
      origin
    })
    if (!reduced.ok) {
      return failure(
        reduced.error.code,
        reduced.error.message,
        reduced.error.details
      )
    }

    return createWriteDraft(reduced, {
      origin,
      ops,
      value
    })
  }

  const execute = <C extends Command>(
    command: C,
    origin: Origin = 'user'
  ): Draft<CommandOutput<C>> => {
    const current = document.get()
    const compiled = compileCommand(command, {
      document: current,
      registries,
      ids,
      nodeSize: config.nodeSize
    })
    if (!compiled.ok) {
      return failure(
        compiled.error.code,
        compiled.error.message,
        compiled.error.details
      )
    }

    return reduceToDraft(
      current,
      compiled.ops,
      origin,
      compiled.output
    ) as Draft<CommandOutput<C>>
  }

  const apply = (
    ops: readonly Operation[],
    origin: Origin = 'user'
  ): Draft => reduceToDraft(
    document.get(),
    ops,
    origin,
    undefined
  )

  return {
    execute,
    apply
  }
}
