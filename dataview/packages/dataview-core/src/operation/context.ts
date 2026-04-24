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

export interface DocumentMutationContext {
  doc(): DataDoc
  replace(doc: DataDoc): void
  inverse: {
    prependMany(ops: readonly DocumentOperation[]): void
  }
  trace: DataviewTrace
}

export interface DocumentMutationFootprintContext {
  doc(): DataDoc
  footprint(key: DataviewMutationKey): void
}
