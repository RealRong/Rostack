import { canvasIntentHandlers } from '@whiteboard/core/mutation/compile/canvas'
import { documentIntentHandlers } from '@whiteboard/core/mutation/compile/document'
import { edgeIntentHandlers } from '@whiteboard/core/mutation/compile/edge'
import { groupIntentHandlers } from '@whiteboard/core/mutation/compile/group'
import type {
  MutationCompile,
  MutationIssue,
} from '@shared/mutation'
import type {
  WhiteboardCompileCode,
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/mutation/compile/helpers'
import {
  createCompileExpect,
} from '@whiteboard/core/mutation/compile/helpers'
import { mindmapIntentHandlers } from '@whiteboard/core/mutation/compile/mindmap'
import { nodeIntentHandlers } from '@whiteboard/core/mutation/compile/node'
import { whiteboardMutationSchema } from '@whiteboard/core/mutation/model'
import {
  createWhiteboardQuery,
  createWhiteboardReader,
} from '@whiteboard/core/query'
import {
  createWhiteboardWriter,
} from '@whiteboard/core/mutation/write'
import type { Document } from '@whiteboard/core/types'
import type { WhiteboardCompileServices } from './helpers'
import type { WhiteboardIntent } from '@whiteboard/core/mutation/intents'
const authoredWhiteboardCompileHandlers = {
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
} satisfies WhiteboardCompileHandlerTable

export const whiteboardCompile: MutationCompile<
  typeof whiteboardMutationSchema,
  WhiteboardIntent,
  WhiteboardCompileServices
> = {
  handlers: Object.fromEntries(
    Object.entries(authoredWhiteboardCompileHandlers).map(([type, handler]) => [
      type,
      (input: {
        intent: WhiteboardIntent
        document: Document
        write: import('@whiteboard/core/mutation/model').WhiteboardMutationWriterBase
        change: import('@whiteboard/core/mutation/model').WhiteboardMutationDelta
        issue: {
          add(issue: MutationIssue): void
          all(): readonly MutationIssue[]
          hasErrors(): boolean
        }
        services: WhiteboardCompileServices
      }) => {
        const compileHandler = handler as (
          input: WhiteboardCompileContext
        ) => unknown
        const reader = createWhiteboardReader(() => input.document)
        const writer = createWhiteboardWriter(input.write, () => input.document)
        const query = createWhiteboardQuery(() => input.document)
        const issue = Object.assign(
          (next: {
            code: WhiteboardCompileCode
            message: string
            details?: unknown
          } & Record<string, unknown>) => {
            input.issue.add({
              ...next,
              source: {
                type: input.intent.type
              }
            } as MutationIssue)
          },
          {
            add: (next: {
              code: WhiteboardCompileCode
              message: string
              details?: unknown
            }) => {
              input.issue.add({
                ...next,
                source: {
                  type: input.intent.type
                }
              } as MutationIssue)
            },
            all: () => input.issue.all(),
            hasErrors: () => input.issue.hasErrors()
          }
        )

        const invalid = (
          message: string,
          details?: unknown
        ) => {
          issue.add({
            code: 'invalid',
            message,
            details
          })
          return {
            kind: 'invalid'
          } as const
        }

        const cancelled = (
          message: string,
          details?: unknown
        ) => {
          issue.add({
            code: 'cancelled',
            message,
            details
          })
          return {
            kind: 'cancelled'
          } as const
        }

        const context = {
          ...input,
          reader,
          writer,
          query,
          issue,
          invalid,
          cancelled,
        } as unknown as WhiteboardCompileContext

        context.expect = createCompileExpect(context)

        return compileHandler(context)
      }
    ])
  ) as unknown as MutationCompile<typeof whiteboardMutationSchema, WhiteboardIntent, WhiteboardCompileServices>['handlers']
}

export const whiteboardCompileHandlers = authoredWhiteboardCompileHandlers

export type {
  WhiteboardCompileAbort,
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
} from '@whiteboard/core/mutation/intents'
