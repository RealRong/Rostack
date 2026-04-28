import type { MutationCompileHandlerTable } from '@shared/mutation'
import type {
  WhiteboardIntentKind,
  WhiteboardMutationTable
} from '@whiteboard/core/operations/intent-types'
import { canvasIntentHandlers } from '@whiteboard/core/operations/compile/canvas'
import { documentIntentHandlers } from '@whiteboard/core/operations/compile/document'
import { edgeIntentHandlers } from '@whiteboard/core/operations/compile/edge'
import { groupIntentHandlers } from '@whiteboard/core/operations/compile/group'
import { mindmapIntentHandlers } from '@whiteboard/core/operations/compile/mindmap'
import { nodeIntentHandlers } from '@whiteboard/core/operations/compile/node'
import {
  createWhiteboardCompileScope,
  type WhiteboardCompileIds,
  type WhiteboardCompileScope
} from '@whiteboard/core/operations/compile/scope'

export type WhiteboardIntentHandler<
  K extends WhiteboardIntentKind = WhiteboardIntentKind
> = MutationCompileHandlerTable<
  WhiteboardMutationTable,
  WhiteboardCompileScope,
  'invalid' | 'cancelled'
>[K]

export const whiteboardIntentHandlers: MutationCompileHandlerTable<
  WhiteboardMutationTable,
  WhiteboardCompileScope,
  'invalid' | 'cancelled'
> = {
  ...documentIntentHandlers,
  ...canvasIntentHandlers,
  ...nodeIntentHandlers,
  ...groupIntentHandlers,
  ...edgeIntentHandlers,
  ...mindmapIntentHandlers
}

export const compile = {
  handlers: whiteboardIntentHandlers,
  createContext: createWhiteboardCompileScope
} as const

export {
  createWhiteboardCompileScope
}

export type {
  WhiteboardCompileIds,
  WhiteboardCompileScope
}
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
