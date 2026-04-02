import type {
  ChangeSet,
  Document
} from '@whiteboard/core/types'
import type { KernelReadImpact } from '@whiteboard/core/kernel'

export type Commit = {
  kind: 'apply' | 'undo' | 'redo' | 'replace'
  document: Document
  changes: ChangeSet
  impact?: KernelReadImpact
}
