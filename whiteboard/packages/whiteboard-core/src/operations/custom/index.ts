import type {
  MutationCustomTable
} from '@shared/mutation'
import type {
  DocumentReader
} from '@whiteboard/core/document/reader'
import type {
  WhiteboardCompileServices
} from '@whiteboard/core/operations/compile'
import type {
  WhiteboardInternalOperation
} from '@whiteboard/core/operations/internal'
import type {
  Document
} from '@whiteboard/core/types'
import {
  planCanvasOrderMove
} from './canvas'
import {
  planMindmapBranchPatch,
  planMindmapCreate,
  planMindmapDelete,
  planMindmapLayout,
  planMindmapMove,
  planMindmapRestore,
  planMindmapTopicCollapse,
  planMindmapTopicDelete,
  planMindmapTopicInsert,
  planMindmapTopicMove,
  planMindmapTopicPatch,
  planMindmapTopicRestore,
} from './mindmap'
import {
  whiteboardStructures
} from './structures'
import type {
  WhiteboardCustomCode
} from './types'

export {
  whiteboardStructures
} from './structures'

export const whiteboardCustom = {
  'canvas.order.move': {
    plan: planCanvasOrderMove
  },
  'mindmap.create': {
    plan: planMindmapCreate
  },
  'mindmap.restore': {
    plan: planMindmapRestore
  },
  'mindmap.delete': {
    plan: planMindmapDelete
  },
  'mindmap.move': {
    plan: planMindmapMove
  },
  'mindmap.layout': {
    plan: planMindmapLayout
  },
  'mindmap.topic.insert': {
    plan: planMindmapTopicInsert
  },
  'mindmap.topic.restore': {
    plan: planMindmapTopicRestore
  },
  'mindmap.topic.move': {
    plan: planMindmapTopicMove
  },
  'mindmap.topic.delete': {
    plan: planMindmapTopicDelete
  },
  'mindmap.topic.patch': {
    plan: planMindmapTopicPatch
  },
  'mindmap.branch.patch': {
    plan: planMindmapBranchPatch
  },
  'mindmap.topic.collapse': {
    plan: planMindmapTopicCollapse
  }
} as const satisfies MutationCustomTable<
  Document,
  WhiteboardInternalOperation,
  DocumentReader,
  WhiteboardCompileServices,
  string,
  WhiteboardCustomCode
>
