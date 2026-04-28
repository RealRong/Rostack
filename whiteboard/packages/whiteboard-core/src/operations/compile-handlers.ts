import type { WhiteboardIntentContext } from '@whiteboard/core/operations/compile-context'
import type {
  WhiteboardIntentKind,
  WhiteboardMutationTable
} from '@whiteboard/core/operations/intent-types'
import type { MutationCompileHandlerTable } from '@shared/mutation'
import { canvasIntentHandlers } from '@whiteboard/core/operations/compile/canvas'
import { documentIntentHandlers } from '@whiteboard/core/operations/compile/document'
import { edgeIntentHandlers } from '@whiteboard/core/operations/compile/edge'
import { groupIntentHandlers } from '@whiteboard/core/operations/compile/group'
import { mindmapIntentHandlers } from '@whiteboard/core/operations/compile/mindmap'
import { nodeIntentHandlers } from '@whiteboard/core/operations/compile/node'

export type WhiteboardIntentHandler<
  K extends WhiteboardIntentKind = WhiteboardIntentKind
> = MutationCompileHandlerTable<
  WhiteboardMutationTable,
  WhiteboardIntentContext,
  'invalid' | 'cancelled'
>[K]

export const whiteboardIntentHandlers: MutationCompileHandlerTable<
  WhiteboardMutationTable,
  WhiteboardIntentContext,
  'invalid' | 'cancelled'
> = {
  ...documentIntentHandlers,
  ...canvasIntentHandlers,
  ...nodeIntentHandlers,
  ...groupIntentHandlers,
  ...edgeIntentHandlers,
  ...mindmapIntentHandlers
}
