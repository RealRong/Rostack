import type { Engine } from '@whiteboard/engine'
import type { HistoryApi } from '@whiteboard/history'
import type { DocumentRead } from '@whiteboard/editor/document/read'
import {
  createDocumentWrite
} from '@whiteboard/editor/write/document'
import {
  createCanvasWrite
} from '@whiteboard/editor/write/canvas'
import {
  createHistoryWrite
} from '@whiteboard/editor/write/history'
import {
  createGroupWrite
} from '@whiteboard/editor/write/group'
import {
  createEdgeWrite
} from '@whiteboard/editor/write/edge'
import {
  createMindmapWrite
} from '@whiteboard/editor/write/mindmap'
import {
  createNodeWrite
} from '@whiteboard/editor/write/node'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { ProjectionRead } from '@whiteboard/editor/projection/read'
import type { EditorWrite } from '@whiteboard/editor/write/types'

export type { EditorWrite } from '@whiteboard/editor/write/types'

export const createEditorWrite = ({
  engine,
  history,
  document,
  projection,
  layout
}: {
  engine: Engine
  history: HistoryApi
  document: DocumentRead
  projection: ProjectionRead
  layout: EditorLayout
}): EditorWrite => {
  const historyWrite = createHistoryWrite(history)
  const documentWrite = createDocumentWrite(engine)
  const canvas = createCanvasWrite(engine)
  const node = createNodeWrite({
    engine,
    read: document,
    layout
  })
  const group = createGroupWrite(engine)
  const edge = createEdgeWrite({
    engine,
    read: {
      document,
      projection: projection.edge
    }
  })
  const mindmap = createMindmapWrite({
    engine,
    layout
  })

  return {
    document: documentWrite,
    canvas,
    node,
    group,
    edge,
    mindmap,
    history: historyWrite
  }
}
