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
import type { BoardConfig } from '@whiteboard/core/config'
import { createId } from '@whiteboard/core/id'
import type { Command, CommandOutput } from '../types/command'
import { failure } from '../result'
import { compileCommand } from './compile'
import { applyOperations } from './apply'
import type {
  WriteDraft,
  WriteRuntime
} from './types'

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
  ): WriteDraft<T> => applyOperations(doc, ops, origin, value)

  const execute = <C extends Command>(
    command: C,
    origin: Origin = 'user'
  ): WriteDraft<CommandOutput<C>> => {
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
    ) as WriteDraft<CommandOutput<C>>
  }

  const apply = (
    ops: readonly Operation[],
    origin: Origin = 'user'
  ): WriteDraft => reduceToDraft(
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
