import type {
  DataDoc
} from '@dataview/core/types'
import type {
  DocumentOperation
} from '@dataview/core/types/operations'
import type {
  DataviewMutationKey
} from '@dataview/core/operations/contracts'
import type {
  DataviewTrace
} from '@dataview/core/operations/trace'
import type {
  DataviewDraftDocument
} from '@dataview/core/operations/internal/draft'

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
