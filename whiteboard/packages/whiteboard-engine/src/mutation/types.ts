import type {
  ChangeSet,
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
  Size
} from '@whiteboard/core/types'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type { Intent, IntentData } from '../types/intent'
import type { IntentFailure } from '../types/result'

export type CompileResult<T = unknown> =
  | {
      ok: true
      ops: readonly Operation[]
      output: T
    }
  | IntentFailure<'invalid' | 'cancelled'>

export type CompilerIds = {
  node: () => NodeId
  edge: () => EdgeId
  edgeLabel: () => string
  edgeRoutePoint: () => string
  group: () => GroupId
  mindmap: () => MindmapId
}

export type IntentCompilerTx = {
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
  emitMany: (ops: readonly Operation[]) => void
  fail: {
    invalid: (message: string, details?: unknown) => never
    cancelled: (message: string, details?: unknown) => never
  }
}

export type IntentCompileContext = {
  tx: IntentCompilerTx
  registries: CoreRegistries
  nodeSize: Size
}

export type CompileHandler<I extends Intent = Intent> = (
  intent: I,
  ctx: IntentCompileContext
) => IntentData<I['type']> | void

export type WhiteboardMutationExtra = {
  changes: ChangeSet
}

export type WhiteboardMutationKey =
  HistoryFootprint[number]
