import type {
  CanvasItemRef,
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
import type { Command, CommandOutput } from '@whiteboard/engine/types/command'
import type { CommandFailure } from '@whiteboard/engine/types/result'
import type { Draft } from '@whiteboard/engine/types/internal/draft'

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
  execute: <C extends Command>(command: C, origin?: Origin) => Draft<CommandOutput<C>>
  apply: (
    ops: readonly Operation[],
    origin?: Origin
  ) => Draft
}
