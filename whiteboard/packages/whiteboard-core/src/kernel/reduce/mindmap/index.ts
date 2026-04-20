import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createMindmapStructureApi } from '@whiteboard/core/kernel/reduce/mindmap/structure'
import { createMindmapRootApi } from '@whiteboard/core/kernel/reduce/mindmap/root'
import { createMindmapLayoutApi } from '@whiteboard/core/kernel/reduce/mindmap/layout'
import { createMindmapTopicApi } from '@whiteboard/core/kernel/reduce/mindmap/topic'
import { createMindmapBranchApi } from '@whiteboard/core/kernel/reduce/mindmap/branch'

export const createMindmapApi = (
  tx: ReducerTx
) => ({
  structure: createMindmapStructureApi(tx),
  root: createMindmapRootApi(tx),
  layout: createMindmapLayoutApi(tx),
  topic: createMindmapTopicApi(tx),
  branch: createMindmapBranchApi(tx)
})
