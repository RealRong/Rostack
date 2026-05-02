import { assertDocument } from '@whiteboard/core/document/assert'
import { createDocument } from '@whiteboard/core/document/model'
import { normalizeDocument } from '@whiteboard/core/document/normalize'
import {
  createInsertSliceOps,
  exportSliceFromEdge,
  exportSliceFromNodes,
  exportSliceFromSelection,
  getSliceBounds,
  translateSlice
} from '@whiteboard/core/document/slice'

export const document = {
  create: createDocument,
  assert: assertDocument,
  normalize: normalizeDocument,
  slice: {
    bounds: getSliceBounds,
    translate: translateSlice,
    export: {
      nodes: exportSliceFromNodes,
      edge: exportSliceFromEdge,
      selection: exportSliceFromSelection
    },
    insert: {
      ops: createInsertSliceOps
    }
  }
} as const

export type {
  Slice,
  SliceExportResult,
  SliceInsertOptions,
  SliceInsertResult,
  SliceRoots
} from '@whiteboard/core/types/document'

export { normalizeDocument } from '@whiteboard/core/document/normalize'
