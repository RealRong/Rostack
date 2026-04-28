import { canvasIntentHandlers } from '@whiteboard/core/operations/compile/canvas'
import { documentIntentHandlers } from '@whiteboard/core/operations/compile/document'
import { edgeIntentHandlers } from '@whiteboard/core/operations/compile/edge'
import { groupIntentHandlers } from '@whiteboard/core/operations/compile/group'
import type {
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/operations/compile/helpers'
import { mindmapIntentHandlers } from '@whiteboard/core/operations/compile/mindmap'
import { nodeIntentHandlers } from '@whiteboard/core/operations/compile/node'
export const whiteboardCompileHandlers: WhiteboardCompileHandlerTable = {
  'document.replace': documentIntentHandlers['document.replace'],
  'document.insert': documentIntentHandlers['document.insert'],
  'document.background.set': documentIntentHandlers['document.background.set'],
  'canvas.delete': canvasIntentHandlers['canvas.delete'],
  'canvas.duplicate': canvasIntentHandlers['canvas.duplicate'],
  'canvas.selection.move': canvasIntentHandlers['canvas.selection.move'],
  'canvas.order.move': canvasIntentHandlers['canvas.order.move'],
  'node.create': nodeIntentHandlers['node.create'],
  'node.update': nodeIntentHandlers['node.update'],
  'node.move': nodeIntentHandlers['node.move'],
  'node.text.commit': nodeIntentHandlers['node.text.commit'],
  'node.align': nodeIntentHandlers['node.align'],
  'node.distribute': nodeIntentHandlers['node.distribute'],
  'node.delete': nodeIntentHandlers['node.delete'],
  'node.deleteCascade': nodeIntentHandlers['node.deleteCascade'],
  'node.duplicate': nodeIntentHandlers['node.duplicate'],
  'group.merge': groupIntentHandlers['group.merge'],
  'group.order.move': groupIntentHandlers['group.order.move'],
  'group.ungroup': groupIntentHandlers['group.ungroup'],
  'edge.create': edgeIntentHandlers['edge.create'],
  'edge.update': edgeIntentHandlers['edge.update'],
  'edge.move': edgeIntentHandlers['edge.move'],
  'edge.reconnect.commit': edgeIntentHandlers['edge.reconnect.commit'],
  'edge.delete': edgeIntentHandlers['edge.delete'],
  'edge.label.insert': edgeIntentHandlers['edge.label.insert'],
  'edge.label.update': edgeIntentHandlers['edge.label.update'],
  'edge.label.move': edgeIntentHandlers['edge.label.move'],
  'edge.label.delete': edgeIntentHandlers['edge.label.delete'],
  'edge.route.insert': edgeIntentHandlers['edge.route.insert'],
  'edge.route.update': edgeIntentHandlers['edge.route.update'],
  'edge.route.set': edgeIntentHandlers['edge.route.set'],
  'edge.route.move': edgeIntentHandlers['edge.route.move'],
  'edge.route.delete': edgeIntentHandlers['edge.route.delete'],
  'edge.route.clear': edgeIntentHandlers['edge.route.clear'],
  'mindmap.create': mindmapIntentHandlers['mindmap.create'],
  'mindmap.delete': mindmapIntentHandlers['mindmap.delete'],
  'mindmap.layout.set': mindmapIntentHandlers['mindmap.layout.set'],
  'mindmap.move': mindmapIntentHandlers['mindmap.move'],
  'mindmap.topic.insert': mindmapIntentHandlers['mindmap.topic.insert'],
  'mindmap.topic.move': mindmapIntentHandlers['mindmap.topic.move'],
  'mindmap.topic.delete': mindmapIntentHandlers['mindmap.topic.delete'],
  'mindmap.topic.clone': mindmapIntentHandlers['mindmap.topic.clone'],
  'mindmap.topic.update': mindmapIntentHandlers['mindmap.topic.update'],
  'mindmap.topic.collapse.set': mindmapIntentHandlers['mindmap.topic.collapse.set'],
  'mindmap.branch.update': mindmapIntentHandlers['mindmap.branch.update']
}

export type {
  WhiteboardCompileCode,
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable,
  WhiteboardCompileIds,
  WhiteboardCompileServices
} from '@whiteboard/core/operations/compile/helpers'
export type {
  CanvasIntent,
  DocumentIntent,
  EdgeBatchUpdate,
  EdgeIntent,
  GroupIntent,
  MindmapBranchBatchUpdate,
  MindmapIntent,
  MindmapTopicBatchUpdate,
  NodeBatchUpdate,
  NodeIntent,
  ReplaceDocumentIntent,
  WhiteboardIntent,
  WhiteboardIntentKind,
  WhiteboardIntentOutput,
  WhiteboardIntentTable,
  WhiteboardMutationTable
} from '@whiteboard/core/operations/intents'
