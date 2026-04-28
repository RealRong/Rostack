import type {
  MutationCompileControl,
  MutationCompileHandlerInput
} from '@shared/mutation'
import type {
  WhiteboardIntentKind
} from '@whiteboard/core/operations/intent-types'
import { canvasIntentHandlers } from '@whiteboard/core/operations/compile/canvas'
import type {
  WhiteboardCompileCode,
  WhiteboardIntentHandler,
  WhiteboardIntentHandlers,
  WhiteboardScopedIntentHandler
} from '@whiteboard/core/operations/compile/contracts'
import { documentIntentHandlers } from '@whiteboard/core/operations/compile/document'
import { edgeIntentHandlers } from '@whiteboard/core/operations/compile/edge'
import { groupIntentHandlers } from '@whiteboard/core/operations/compile/group'
import { mindmapIntentHandlers } from '@whiteboard/core/operations/compile/mindmap'
import { nodeIntentHandlers } from '@whiteboard/core/operations/compile/node'
import {
  createWhiteboardCompileScope,
  type WhiteboardCompileIds,
  type WhiteboardCompileServices,
  type WhiteboardCompileScope
} from '@whiteboard/core/operations/compile/scope'

const isCompileControl = (
  value: unknown
): value is MutationCompileControl<WhiteboardCompileCode> => (
  typeof value === 'object'
  && value !== null
  && 'kind' in value
  && (value.kind === 'stop' || value.kind === 'block')
)

const wrapScopedHandler = <
  K extends WhiteboardIntentKind
>(
  handler: WhiteboardScopedIntentHandler<K>
): WhiteboardIntentHandler<K> => (
  input: MutationCompileHandlerInput<
    import('@whiteboard/core/types').Document,
    import('@whiteboard/core/operations/intent-types').WhiteboardIntent<K>,
    import('@whiteboard/core/types').Operation,
    import('@whiteboard/core/operations/intent-types').WhiteboardIntentOutput<K>,
    WhiteboardCompileServices,
    WhiteboardCompileCode
  >
) => {
  const result = handler(input.intent, createWhiteboardCompileScope({
    controls: input
  }))
  if (isCompileControl(result)) {
    return result
  }
  if (result !== undefined) {
    input.output(result)
  }
}

export const whiteboardIntentHandlers: WhiteboardIntentHandlers = {
  'document.replace': wrapScopedHandler(documentIntentHandlers['document.replace']),
  'document.insert': wrapScopedHandler(documentIntentHandlers['document.insert']),
  'document.background.set': wrapScopedHandler(documentIntentHandlers['document.background.set']),
  'canvas.delete': wrapScopedHandler(canvasIntentHandlers['canvas.delete']),
  'canvas.duplicate': wrapScopedHandler(canvasIntentHandlers['canvas.duplicate']),
  'canvas.selection.move': wrapScopedHandler(canvasIntentHandlers['canvas.selection.move']),
  'canvas.order.move': wrapScopedHandler(canvasIntentHandlers['canvas.order.move']),
  'node.create': wrapScopedHandler(nodeIntentHandlers['node.create']),
  'node.update': wrapScopedHandler(nodeIntentHandlers['node.update']),
  'node.move': wrapScopedHandler(nodeIntentHandlers['node.move']),
  'node.text.commit': wrapScopedHandler(nodeIntentHandlers['node.text.commit']),
  'node.align': wrapScopedHandler(nodeIntentHandlers['node.align']),
  'node.distribute': wrapScopedHandler(nodeIntentHandlers['node.distribute']),
  'node.delete': wrapScopedHandler(nodeIntentHandlers['node.delete']),
  'node.deleteCascade': wrapScopedHandler(nodeIntentHandlers['node.deleteCascade']),
  'node.duplicate': wrapScopedHandler(nodeIntentHandlers['node.duplicate']),
  'group.merge': wrapScopedHandler(groupIntentHandlers['group.merge']),
  'group.order.move': wrapScopedHandler(groupIntentHandlers['group.order.move']),
  'group.ungroup': wrapScopedHandler(groupIntentHandlers['group.ungroup']),
  'edge.create': wrapScopedHandler(edgeIntentHandlers['edge.create']),
  'edge.update': wrapScopedHandler(edgeIntentHandlers['edge.update']),
  'edge.move': wrapScopedHandler(edgeIntentHandlers['edge.move']),
  'edge.reconnect.commit': wrapScopedHandler(edgeIntentHandlers['edge.reconnect.commit']),
  'edge.delete': wrapScopedHandler(edgeIntentHandlers['edge.delete']),
  'edge.label.insert': wrapScopedHandler(edgeIntentHandlers['edge.label.insert']),
  'edge.label.update': wrapScopedHandler(edgeIntentHandlers['edge.label.update']),
  'edge.label.move': wrapScopedHandler(edgeIntentHandlers['edge.label.move']),
  'edge.label.delete': wrapScopedHandler(edgeIntentHandlers['edge.label.delete']),
  'edge.route.insert': wrapScopedHandler(edgeIntentHandlers['edge.route.insert']),
  'edge.route.update': wrapScopedHandler(edgeIntentHandlers['edge.route.update']),
  'edge.route.set': wrapScopedHandler(edgeIntentHandlers['edge.route.set']),
  'edge.route.move': wrapScopedHandler(edgeIntentHandlers['edge.route.move']),
  'edge.route.delete': wrapScopedHandler(edgeIntentHandlers['edge.route.delete']),
  'edge.route.clear': wrapScopedHandler(edgeIntentHandlers['edge.route.clear']),
  'mindmap.create': wrapScopedHandler(mindmapIntentHandlers['mindmap.create']),
  'mindmap.delete': wrapScopedHandler(mindmapIntentHandlers['mindmap.delete']),
  'mindmap.layout.set': wrapScopedHandler(mindmapIntentHandlers['mindmap.layout.set']),
  'mindmap.move': wrapScopedHandler(mindmapIntentHandlers['mindmap.move']),
  'mindmap.topic.insert': wrapScopedHandler(mindmapIntentHandlers['mindmap.topic.insert']),
  'mindmap.topic.move': wrapScopedHandler(mindmapIntentHandlers['mindmap.topic.move']),
  'mindmap.topic.delete': wrapScopedHandler(mindmapIntentHandlers['mindmap.topic.delete']),
  'mindmap.topic.clone': wrapScopedHandler(mindmapIntentHandlers['mindmap.topic.clone']),
  'mindmap.topic.update': wrapScopedHandler(mindmapIntentHandlers['mindmap.topic.update']),
  'mindmap.topic.collapse.set': wrapScopedHandler(mindmapIntentHandlers['mindmap.topic.collapse.set']),
  'mindmap.branch.update': wrapScopedHandler(mindmapIntentHandlers['mindmap.branch.update'])
}

export const compile = {
  handlers: whiteboardIntentHandlers
} as const

export type {
  WhiteboardCompileCode,
  WhiteboardIntentHandler,
  WhiteboardIntentHandlers,
  WhiteboardScopedIntentHandler,
  WhiteboardScopedIntentHandlers
} from '@whiteboard/core/operations/compile/contracts'
export type {
  WhiteboardCompileIds,
  WhiteboardCompileServices,
  WhiteboardCompileScope
} from '@whiteboard/core/operations/compile/scope'
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
} from '@whiteboard/core/operations/intent-types'
