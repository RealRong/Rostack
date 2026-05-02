import { canvasIntentHandlers } from '@whiteboard/core/mutation/compile/canvas'
import { documentIntentHandlers } from '@whiteboard/core/mutation/compile/document'
import { edgeIntentHandlers } from '@whiteboard/core/mutation/compile/edge'
import { groupIntentHandlers } from '@whiteboard/core/mutation/compile/group'
import type { MutationCompileHandlerTable } from '@shared/mutation/engine'
import type { MutationWriter } from '@shared/mutation'
import type {
  WhiteboardCompileCode,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/mutation/compile/helpers'
import {
  withCompileContext,
} from '@whiteboard/core/mutation/compile/helpers'
import { mindmapIntentHandlers } from '@whiteboard/core/mutation/compile/mindmap'
import { nodeIntentHandlers } from '@whiteboard/core/mutation/compile/node'
import { whiteboardMutationModel } from '@whiteboard/core/mutation/model'
import type { WhiteboardReader } from '@whiteboard/core/query'
import type { Document } from '@whiteboard/core/types'
import type { WhiteboardCompileServices } from './helpers'
import type { WhiteboardMutationTable } from '@whiteboard/core/mutation/intents'
const authoredWhiteboardCompileHandlers: WhiteboardCompileHandlerTable = {
  'document.replace': documentIntentHandlers['document.replace'],
  'document.insert': documentIntentHandlers['document.insert'],
  'document.background.set': documentIntentHandlers['document.background.set'],
  'canvas.delete': canvasIntentHandlers['canvas.delete'],
  'canvas.duplicate': canvasIntentHandlers['canvas.duplicate'],
  'canvas.selection.move': canvasIntentHandlers['canvas.selection.move'],
  'document.order.move': canvasIntentHandlers['document.order.move'],
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
  'mindmap.branch.update': mindmapIntentHandlers['mindmap.branch.update'],
}

const wrappedWhiteboardCompileHandlers = {
  'document.replace': withCompileContext(authoredWhiteboardCompileHandlers['document.replace']),
  'document.insert': withCompileContext(authoredWhiteboardCompileHandlers['document.insert']),
  'document.background.set': withCompileContext(authoredWhiteboardCompileHandlers['document.background.set']),
  'canvas.delete': withCompileContext(authoredWhiteboardCompileHandlers['canvas.delete']),
  'canvas.duplicate': withCompileContext(authoredWhiteboardCompileHandlers['canvas.duplicate']),
  'canvas.selection.move': withCompileContext(authoredWhiteboardCompileHandlers['canvas.selection.move']),
  'document.order.move': withCompileContext(authoredWhiteboardCompileHandlers['document.order.move']),
  'node.create': withCompileContext(authoredWhiteboardCompileHandlers['node.create']),
  'node.update': withCompileContext(authoredWhiteboardCompileHandlers['node.update']),
  'node.move': withCompileContext(authoredWhiteboardCompileHandlers['node.move']),
  'node.text.commit': withCompileContext(authoredWhiteboardCompileHandlers['node.text.commit']),
  'node.align': withCompileContext(authoredWhiteboardCompileHandlers['node.align']),
  'node.distribute': withCompileContext(authoredWhiteboardCompileHandlers['node.distribute']),
  'node.delete': withCompileContext(authoredWhiteboardCompileHandlers['node.delete']),
  'node.deleteCascade': withCompileContext(authoredWhiteboardCompileHandlers['node.deleteCascade']),
  'node.duplicate': withCompileContext(authoredWhiteboardCompileHandlers['node.duplicate']),
  'group.merge': withCompileContext(authoredWhiteboardCompileHandlers['group.merge']),
  'group.order.move': withCompileContext(authoredWhiteboardCompileHandlers['group.order.move']),
  'group.ungroup': withCompileContext(authoredWhiteboardCompileHandlers['group.ungroup']),
  'edge.create': withCompileContext(authoredWhiteboardCompileHandlers['edge.create']),
  'edge.update': withCompileContext(authoredWhiteboardCompileHandlers['edge.update']),
  'edge.move': withCompileContext(authoredWhiteboardCompileHandlers['edge.move']),
  'edge.reconnect.commit': withCompileContext(authoredWhiteboardCompileHandlers['edge.reconnect.commit']),
  'edge.delete': withCompileContext(authoredWhiteboardCompileHandlers['edge.delete']),
  'edge.label.insert': withCompileContext(authoredWhiteboardCompileHandlers['edge.label.insert']),
  'edge.label.update': withCompileContext(authoredWhiteboardCompileHandlers['edge.label.update']),
  'edge.label.move': withCompileContext(authoredWhiteboardCompileHandlers['edge.label.move']),
  'edge.label.delete': withCompileContext(authoredWhiteboardCompileHandlers['edge.label.delete']),
  'edge.route.insert': withCompileContext(authoredWhiteboardCompileHandlers['edge.route.insert']),
  'edge.route.update': withCompileContext(authoredWhiteboardCompileHandlers['edge.route.update']),
  'edge.route.set': withCompileContext(authoredWhiteboardCompileHandlers['edge.route.set']),
  'edge.route.move': withCompileContext(authoredWhiteboardCompileHandlers['edge.route.move']),
  'edge.route.delete': withCompileContext(authoredWhiteboardCompileHandlers['edge.route.delete']),
  'edge.route.clear': withCompileContext(authoredWhiteboardCompileHandlers['edge.route.clear']),
  'mindmap.create': withCompileContext(authoredWhiteboardCompileHandlers['mindmap.create']),
  'mindmap.delete': withCompileContext(authoredWhiteboardCompileHandlers['mindmap.delete']),
  'mindmap.layout.set': withCompileContext(authoredWhiteboardCompileHandlers['mindmap.layout.set']),
  'mindmap.move': withCompileContext(authoredWhiteboardCompileHandlers['mindmap.move']),
  'mindmap.topic.insert': withCompileContext(authoredWhiteboardCompileHandlers['mindmap.topic.insert']),
  'mindmap.topic.move': withCompileContext(authoredWhiteboardCompileHandlers['mindmap.topic.move']),
  'mindmap.topic.delete': withCompileContext(authoredWhiteboardCompileHandlers['mindmap.topic.delete']),
  'mindmap.topic.clone': withCompileContext(authoredWhiteboardCompileHandlers['mindmap.topic.clone']),
  'mindmap.topic.update': withCompileContext(authoredWhiteboardCompileHandlers['mindmap.topic.update']),
  'mindmap.topic.collapse.set': withCompileContext(authoredWhiteboardCompileHandlers['mindmap.topic.collapse.set']),
  'mindmap.branch.update': withCompileContext(authoredWhiteboardCompileHandlers['mindmap.branch.update']),
} satisfies MutationCompileHandlerTable<
  WhiteboardMutationTable,
  Document,
  MutationWriter<typeof whiteboardMutationModel>,
  WhiteboardReader,
  WhiteboardCompileServices,
  WhiteboardCompileCode
>

export const whiteboardCompile = {
  handlers: wrappedWhiteboardCompileHandlers
} as const

export const whiteboardCompileHandlers = authoredWhiteboardCompileHandlers

export type {
  WhiteboardCompileCode,
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable,
  WhiteboardCompileIds,
  WhiteboardCompileServices,
  WhiteboardCompileExpect,
} from '@whiteboard/core/mutation/compile/helpers'
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
} from '@whiteboard/core/mutation/intents'
