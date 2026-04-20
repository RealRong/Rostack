import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createMindmapTopicStructureApi } from '@whiteboard/core/kernel/reduce/mindmap/topic/structure'
import { createMindmapTopicFieldApi } from '@whiteboard/core/kernel/reduce/mindmap/topic/field'
import { createMindmapTopicRecordApi } from '@whiteboard/core/kernel/reduce/mindmap/topic/record'
import { createMindmapTopicCollapseApi } from '@whiteboard/core/kernel/reduce/mindmap/topic/collapse'

export const createMindmapTopicApi = (
  tx: ReducerTx
) => ({
  structure: createMindmapTopicStructureApi(tx),
  field: createMindmapTopicFieldApi(tx),
  record: createMindmapTopicRecordApi(tx),
  collapse: createMindmapTopicCollapseApi(tx)
})
