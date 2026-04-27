import type { WhiteboardIntentContext } from '@whiteboard/core/operations/compile-context'
import type {
  CanvasIntent,
  DocumentIntent,
  EdgeIntent,
  GroupIntent,
  MindmapIntent,
  NodeIntent,
  WhiteboardIntent,
  WhiteboardIntentKind,
  WhiteboardIntentOutput
} from '@whiteboard/core/operations/intent-types'
import type { MutationCompileCtx } from '@shared/mutation'
import type {
  Document,
  Operation
} from '@whiteboard/core/types'
import { compileCanvasIntent } from '@whiteboard/core/operations/compile/canvas'
import { compileDocumentIntent } from '@whiteboard/core/operations/compile/document'
import { compileEdgeIntent } from '@whiteboard/core/operations/compile/edge'
import { compileGroupIntent } from '@whiteboard/core/operations/compile/group'
import { compileMindmapIntent } from '@whiteboard/core/operations/compile/mindmap'
import { compileNodeIntent } from '@whiteboard/core/operations/compile/node'

export type WhiteboardIntentHandler<
  K extends WhiteboardIntentKind = WhiteboardIntentKind
> = (
  intent: WhiteboardIntent<K>,
  ctx: WhiteboardIntentContext
) => WhiteboardIntentOutput | void | ReturnType<MutationCompileCtx<Document, Operation>['stop']> | ReturnType<MutationCompileCtx<Document, Operation>['block']>

const handleDocumentIntent: WhiteboardIntentHandler = (intent, ctx) =>
  compileDocumentIntent(intent as DocumentIntent, ctx)

const handleCanvasIntent: WhiteboardIntentHandler = (intent, ctx) =>
  compileCanvasIntent(intent as CanvasIntent, ctx)

const handleNodeIntent: WhiteboardIntentHandler = (intent, ctx) =>
  compileNodeIntent(intent as NodeIntent, ctx)

const handleGroupIntent: WhiteboardIntentHandler = (intent, ctx) =>
  compileGroupIntent(intent as GroupIntent, ctx)

const handleEdgeIntent: WhiteboardIntentHandler = (intent, ctx) =>
  compileEdgeIntent(intent as EdgeIntent, ctx)

const handleMindmapIntent: WhiteboardIntentHandler = (intent, ctx) =>
  compileMindmapIntent(intent as MindmapIntent, ctx)

export const whiteboardIntentHandlers: Record<
  WhiteboardIntentKind,
  WhiteboardIntentHandler
> = {
  'document.replace': handleDocumentIntent,
  'document.insert': handleDocumentIntent,
  'document.background.set': handleDocumentIntent,
  'canvas.delete': handleCanvasIntent,
  'canvas.duplicate': handleCanvasIntent,
  'canvas.selection.move': handleCanvasIntent,
  'canvas.order.move': handleCanvasIntent,
  'node.create': handleNodeIntent,
  'node.update': handleNodeIntent,
  'node.move': handleNodeIntent,
  'node.text.commit': handleNodeIntent,
  'node.align': handleNodeIntent,
  'node.distribute': handleNodeIntent,
  'node.delete': handleNodeIntent,
  'node.deleteCascade': handleNodeIntent,
  'node.duplicate': handleNodeIntent,
  'group.merge': handleGroupIntent,
  'group.order.move': handleGroupIntent,
  'group.ungroup': handleGroupIntent,
  'edge.create': handleEdgeIntent,
  'edge.update': handleEdgeIntent,
  'edge.move': handleEdgeIntent,
  'edge.reconnect.commit': handleEdgeIntent,
  'edge.delete': handleEdgeIntent,
  'edge.label.insert': handleEdgeIntent,
  'edge.label.update': handleEdgeIntent,
  'edge.label.move': handleEdgeIntent,
  'edge.label.delete': handleEdgeIntent,
  'edge.route.insert': handleEdgeIntent,
  'edge.route.update': handleEdgeIntent,
  'edge.route.set': handleEdgeIntent,
  'edge.route.move': handleEdgeIntent,
  'edge.route.delete': handleEdgeIntent,
  'edge.route.clear': handleEdgeIntent,
  'mindmap.create': handleMindmapIntent,
  'mindmap.delete': handleMindmapIntent,
  'mindmap.layout.set': handleMindmapIntent,
  'mindmap.move': handleMindmapIntent,
  'mindmap.topic.insert': handleMindmapIntent,
  'mindmap.topic.move': handleMindmapIntent,
  'mindmap.topic.delete': handleMindmapIntent,
  'mindmap.topic.clone': handleMindmapIntent,
  'mindmap.topic.update': handleMindmapIntent,
  'mindmap.topic.collapse.set': handleMindmapIntent,
  'mindmap.branch.update': handleMindmapIntent
}
