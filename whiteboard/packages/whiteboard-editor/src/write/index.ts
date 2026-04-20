import type { Engine } from '@whiteboard/engine'
import type { EditorQuery } from '@whiteboard/editor/query'
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
import type { EditorWrite } from '@whiteboard/editor/write/types'

export type { EditorWrite } from '@whiteboard/editor/write/types'

export const createEditorWrite = ({
  engine,
  query,
  layout
}: {
  engine: Engine
  query: EditorQuery
  layout: EditorLayout
}): EditorWrite => {
  const history = createHistoryWrite(engine)
  const document = createDocumentWrite(engine)
  const canvas = createCanvasWrite(engine)
  const node = createNodeWrite({
    engine,
    read: query,
    layout
  })
  const group = createGroupWrite(engine)
  const edge = createEdgeWrite({
    engine,
    read: query
  })
  const mindmap = createMindmapWrite({
    engine,
    read: query,
    layout
  })

  return {
    document,
    canvas,
    node,
    group,
    edge,
    mindmap,
    history
  }
}
