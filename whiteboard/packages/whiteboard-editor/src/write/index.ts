import type { HistoryPort } from '@shared/mutation'
import type { Engine } from '@whiteboard/engine'
import type { IntentResult } from '@whiteboard/engine'
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
import type { DocumentFrame } from '@whiteboard/editor-scene'
import type { EditorScene } from '@whiteboard/editor-scene'
import type { EditorWrite } from '@whiteboard/editor/write/types'

export type { EditorWrite } from '@whiteboard/editor/write/types'

export const createEditorWrite = ({
  engine,
  history,
  document,
  projection
}: {
  engine: Engine
  history: HistoryPort<IntentResult>
  document: DocumentFrame
  projection: EditorScene
}): EditorWrite => {
  const historyWrite = createHistoryWrite(history)
  const documentWrite = createDocumentWrite(engine)
  const canvas = createCanvasWrite(engine)
  const node = createNodeWrite({
    engine,
    read: {
      document
    }
  })
  const group = createGroupWrite(engine)
  const edge = createEdgeWrite({
    engine,
    read: {
      document,
      readEdge: (edgeId) => projection.edges.get(edgeId)?.base.edge
    }
  })
  const mindmap = createMindmapWrite({
    engine
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
