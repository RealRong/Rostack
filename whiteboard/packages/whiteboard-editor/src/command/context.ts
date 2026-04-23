import type { Engine } from '@whiteboard/engine'
import type { InputDelta } from '@whiteboard/editor-graph'
import type { DocumentRead } from '@whiteboard/editor/document/read'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { GraphRead } from '@whiteboard/editor/read/graph'
import type { SessionRead } from '@whiteboard/editor/session/read'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorWrite } from '@whiteboard/editor/write'
import type {
  EditorCommand,
  EditorPublishRequest,
  EditorTaskRequest
} from './contracts'

export interface EditorCommandContext {
  engine: Engine
  document: DocumentRead
  graph: GraphRead
  session: EditorSession
  sessionRead: SessionRead
  layout: EditorLayout
  write: EditorWrite
  publish(delta?: InputDelta): EditorPublishRequest
  task: {
    microtask(command: EditorCommand<void>): EditorTaskRequest
    frame(command: EditorCommand<void>): EditorTaskRequest
    delay(delayMs: number, command: EditorCommand<void>): EditorTaskRequest
  }
}

export const createEditorCommandContext = ({
  engine,
  document,
  graph,
  session,
  sessionRead,
  layout,
  write
}: {
  engine: Engine
  document: DocumentRead
  graph: GraphRead
  session: EditorSession
  sessionRead: SessionRead
  layout: EditorLayout
  write: EditorWrite
}): EditorCommandContext => ({
  engine,
  document,
  graph,
  session,
  sessionRead,
  layout,
  write,
  publish: (delta) => ({
    kind: 'publish',
    delta
  }),
  task: {
    microtask: (command) => ({
      kind: 'task',
      lane: 'microtask',
      command
    }),
    frame: (command) => ({
      kind: 'task',
      lane: 'frame',
      command
    }),
    delay: (delayMs, command) => ({
      kind: 'task',
      lane: 'delay',
      delayMs,
      command
    })
  }
})
