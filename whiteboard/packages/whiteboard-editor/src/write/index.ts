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
import type { TextLayoutMeasure } from '@whiteboard/editor/layout/textLayout'
import type { DocumentQuery } from '@whiteboard/editor-scene'
import type { EditorSceneApi } from '@whiteboard/editor/types/editor'
import type { EditorWrite } from '@whiteboard/editor/write/types'
import type { NodeSpecReader } from '@whiteboard/editor/types/node'

export type { EditorWrite } from '@whiteboard/editor/write/types'

export const createEditorWrite = ({
  engine,
  history,
  document,
  projection,
  nodes,
  measure
}: {
  engine: Engine
  history: HistoryPort<IntentResult>
  document: DocumentQuery
  projection: EditorSceneApi
  nodes: NodeSpecReader
  measure: TextLayoutMeasure
}): EditorWrite => {
  const historyWrite = createHistoryWrite(history)
  const documentWrite = createDocumentWrite(engine)
  const canvas = createCanvasWrite(engine)
  const node = createNodeWrite({
    engine,
    read: {
      document
    },
    nodes,
    measure
  })
  const group = createGroupWrite(engine)
  const edge = createEdgeWrite({
    engine,
    read: {
      document,
      readEdge: (edgeId) => projection.query.edge.get(edgeId)?.base.edge
    }
  })
  const mindmap = createMindmapWrite({
    engine,
    nodes,
    measure
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
