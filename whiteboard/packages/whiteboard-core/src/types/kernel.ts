import type {
  Document,
  EdgeId,
  NodeId
} from '@whiteboard/core/types/model'
import type {
  ChangeSet,
  Invalidation
} from '@whiteboard/core/types/writes'
import type { MutationWrite } from '@shared/mutation'
import type { Result, ResultCode } from '@whiteboard/core/types/result'

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
  inverse: readonly MutationWrite[]
  impact: KernelReadImpact
}

export type KernelReduceResult = Result<KernelReduceData, ResultCode>
