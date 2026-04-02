import type { Document, Operation } from '@whiteboard/core/types'

export type RemoteDocumentChange =
  | {
      kind: 'operations'
      operations: readonly Operation[]
    }
  | {
      kind: 'replace'
      document: Document
    }
