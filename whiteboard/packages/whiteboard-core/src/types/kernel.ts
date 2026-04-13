import type {
  Document,
  EdgeId,
  NodeId
} from '#whiteboard-core/types/model'
import type { ChangeSet, Operation, Origin } from '#whiteboard-core/types/operations'
import type { Result, ResultCode } from '#whiteboard-core/types/result'

export type HistoryState = {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  isApplying: boolean
  lastUpdatedAt?: number
}

export type HistoryConfig = {
  enabled: boolean
  capacity: number
  captureSystem: boolean
  captureRemote: boolean
}

export type HistoryCapture<
  TOperation = Operation,
  TOrigin extends string = Origin
> = {
  forward: readonly TOperation[]
  inverse: readonly TOperation[]
  origin?: TOrigin
}

export type HistoryReplay<
  TOperation = Operation,
  TReplayResult = boolean
> = (operations: readonly TOperation[]) => TReplayResult | false

export type HistoryApi<
  TOperation = Operation,
  TOrigin extends string = Origin,
  TReplayResult = boolean
> = {
  get: () => HistoryState
  subscribe: (listener: (state: HistoryState) => void) => () => void
  configure: (config: Partial<HistoryConfig>) => void
  clear: () => void
  capture: (entry: HistoryCapture<TOperation, TOrigin>) => void
  undo: () => TReplayResult | false
  redo: () => TReplayResult | false
}

export type KernelContext = {
  now?: () => number
  origin?: Origin
}

export type KernelReadImpact = {
  reset: boolean
  document: boolean
  node: {
    ids: readonly NodeId[]
    geometry: boolean
    list: boolean
    value: boolean
  }
  edge: {
    ids: readonly EdgeId[]
    nodeIds: readonly NodeId[]
    geometry: boolean
    list: boolean
    value: boolean
  }
  mindmap: {
    ids: readonly NodeId[]
    view: boolean
  }
}

export type KernelReduceData = {
  doc: Document
  changes: ChangeSet
  inverse: readonly Operation[]
  read: KernelReadImpact
}

export type KernelReduceResult = Result<KernelReduceData, ResultCode>
