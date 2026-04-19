import type {
  ChangeSet,
  Document
} from '@whiteboard/core/types'
import type { Invalidation, Operation } from '@whiteboard/core/types'
import type { KernelReadImpact } from '@whiteboard/core/kernel'

export type Commit = {
  rev: number
  at: number
  doc: Document
  ops: readonly Operation[]
  inverse: readonly Operation[]
  changes: ChangeSet
  invalidation: Invalidation
  impact: KernelReadImpact
}
