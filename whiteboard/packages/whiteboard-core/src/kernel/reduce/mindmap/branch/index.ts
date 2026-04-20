import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createMindmapBranchFieldApi } from '@whiteboard/core/kernel/reduce/mindmap/branch/field'

export const createMindmapBranchApi = (
  tx: ReducerTx
) => ({
  field: createMindmapBranchFieldApi(tx)
})
