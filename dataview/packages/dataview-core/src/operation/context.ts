import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import type {
  DataviewMutationKey
} from '@dataview/core/mutation/key'
import type {
  DataviewTrace
} from '@dataview/core/mutation/trace'
import type {
  DataviewDraftDocument
} from '@dataview/core/mutation/draftDocument'

export interface DocumentMutationContext {
  doc(): DataDoc
  draft: DataviewDraftDocument
  inverse: {
    prependMany(ops: readonly DocumentOperation[]): void
  }
  trace: DataviewTrace
}

export interface DocumentMutationFootprintContext {
  doc(): DataDoc
  footprint(key: DataviewMutationKey): void
}

export interface DocumentMutationOperationContext
  extends DocumentMutationContext,
    DocumentMutationFootprintContext {}
