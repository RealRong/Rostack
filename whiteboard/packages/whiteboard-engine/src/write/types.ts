import type {
  CanvasItemRef,
  ChangeSet,
  CoreRegistries,
  Document,
  Edge,
  EdgeId,
  Group,
  GroupId,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId,
  Operation,
  Origin,
  Size
} from '@whiteboard/core/types'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type { Command, CommandOutput } from '../types/command'
import type { CommandFailure } from '../types/result'

export type CompileResult<T = unknown> =
  | {
      ok: true
      ops: readonly Operation[]
      output: T
    }
  | CommandFailure<'invalid' | 'cancelled'>

export type CompilerIds = {
  node: () => NodeId
  edge: () => EdgeId
  edgeLabel: () => string
  edgeRoutePoint: () => string
  group: () => GroupId
  mindmap: () => MindmapId
}

export type CommandCompilerTx = {
  read: {
    document: {
      get: () => Document
    }
    canvas: {
      order: () => readonly CanvasItemRef[]
    }
    node: {
      get: (id: NodeId) => Node | undefined
      require: (id: NodeId) => Node
    }
    edge: {
      get: (id: EdgeId) => Edge | undefined
      require: (id: EdgeId) => Edge
    }
    group: {
      get: (id: GroupId) => Group | undefined
      require: (id: GroupId) => Group
    }
    mindmap: {
      get: (id: MindmapId) => MindmapRecord | undefined
      require: (id: MindmapId) => MindmapRecord
    }
  }
  ids: CompilerIds
  emit: (op: Operation) => void
  fail: {
    invalid: (message: string, details?: unknown) => never
    cancelled: (message: string, details?: unknown) => never
  }
}

export type CommandCompileContext = {
  tx: CommandCompilerTx
  registries: CoreRegistries
  nodeSize: Size
}

export type CompileHandler<C extends Command = Command> = (
  command: C,
  ctx: CommandCompileContext
) => CommandOutput<C> | void

export type WriteRuntime = {
  execute: <C extends Command>(command: C, origin?: Origin) => WriteDraft<CommandOutput<C>>
  apply: (
    ops: readonly Operation[],
    origin?: Origin
  ) => WriteDraft
}

export type WriteDraft<T = void> =
  | CommandFailure
  | {
      ok: true
      origin: Origin
      doc: Document
      ops: readonly Operation[]
      inverse: readonly Operation[]
      changes: ChangeSet
      history: {
        footprint: HistoryFootprint
      }
      value: T
    }
