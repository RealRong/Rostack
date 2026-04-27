import type {
  Document,
  EdgeId,
  NodeId
} from '@whiteboard/core/types/model'
import type {
  ChangeSet,
  Invalidation,
  Operation
} from '@whiteboard/core/types/operations'
import type { Result, ResultCode } from '@whiteboard/core/types/result'
import type { HistoryFootprint } from '@whiteboard/core/operations/history'

export type KernelContext = {
  now?: () => number
  origin?: import('@whiteboard/core/types').Origin
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
}

export type KernelReduceData = {
  doc: Document
  changes: ChangeSet
  invalidation: Invalidation
  inverse: readonly Operation[]
  history: {
    footprint: HistoryFootprint
  }
  impact: KernelReadImpact
}

export type KernelReduceResult = Result<KernelReduceData, ResultCode>
