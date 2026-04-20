import type {
  ChangeSet,
  Document,
  Origin
} from '@whiteboard/core/types'
import type { Operation } from '@whiteboard/core/types'

export type Commit = {
  rev: number
  at: number
  origin: Origin
  doc: Document
  ops: readonly Operation[]
  changes: ChangeSet
}
